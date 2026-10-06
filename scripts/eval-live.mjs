// Manual only: node scripts/eval-live.mjs --confirm-live [--base-url=http://localhost:3000]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "@playwright/test";

import { scoreEvaluation } from "../lib/eval/metrics.ts";

if (process.env.CI || !process.argv.includes("--confirm-live")) {
  throw new Error("Live evaluation is manual only. Run with --confirm-live outside CI; it will consume real free-tier quota.");
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.argv.find((arg) => arg.startsWith("--base-url="))?.slice("--base-url=".length) || "http://localhost:3000";
const publicCode = process.argv.find((arg) => arg.startsWith("--code="))?.slice("--code=".length);
const suite = JSON.parse(await readFile(join(root, "evals/cases.v1.json"), "utf8"));
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: baseUrl });
const page = await context.newPage();
const observations = [];
let entered = false;

function streamCitations(body) {
  return body.split("\n")
    .filter((line) => line.startsWith("data: "))
    .flatMap((line) => {
      try {
        const item = JSON.parse(line.slice(6));
        return item.type === "data-citations" ? item.data.items : [];
      } catch { return []; }
    })
    .slice(0, 3)
    .map((item) => ({ file: item.fileName, excerpt: item.excerpt }));
}

try {
  await page.goto("/");
  if (publicCode) {
    await page.getByText("Enter a code manually").click();
    await page.getByLabel("Access code").fill(publicCode);
    await page.getByRole("button", { name: "Continue" }).click();
  } else {
    await page.getByRole("button", { name: "Enter demo" }).click();
  }
  await page.getByRole("heading", { name: "Ask your sources." }).waitFor();
  entered = true;
  const workspaceResponse = await page.request.post("/api/workspace");
  if (!workspaceResponse.ok()) throw new Error(`Workspace unavailable: HTTP ${workspaceResponse.status()}`);
  const workspace = await workspaceResponse.json();
  const limit = Math.min(20, suite.cases.length, workspace.limits.questionsPerWorkspacePerDay);
  const files = suite.documents.map((name) => join(root, "evals/fixtures", name));
  let rejectUploadQuota;
  const uploadQuota = new Promise((_, reject) => { rejectUploadQuota = reject; });
  const onUploadResponse = (response) => {
    if (/\/api\/documents\/[^/]+\/process$/.test(response.url()) && response.status() === 429) {
      rejectUploadQuota(new Error("Stopped at ingestion quota (HTTP 429)."));
    }
  };
  page.on("response", onUploadResponse);
  try {
    await page.locator('input[type="file"]').setInputFiles(files);
    await Promise.race([
      page.waitForFunction((expected) => document.querySelectorAll(".document-card .status-dot.ready").length === expected, files.length, { timeout: 240_000 }),
      uploadQuota,
    ]);
  } finally {
    page.off("response", onUploadResponse);
  }

  for (const item of suite.cases.slice(0, limit)) {
    const before = await page.locator(".message.assistant").count();
    const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/chat") && response.request().method() === "POST", { timeout: 90_000 });
    const started = performance.now();
    await page.locator(".composer textarea").fill(item.question);
    await page.getByRole("button", { name: "Send message" }).click();
    const response = await responsePromise;
    if (response.status() === 429) { console.log("Stopped at application quota (HTTP 429)."); break; }
    if (!response.ok()) throw new Error(`Question ${item.id} failed: HTTP ${response.status()}`);
    const body = (await response.body()).toString("utf8");
    if (/"type":"error"/.test(body) && /quota|RESOURCE_EXHAUSTED|429/i.test(body)) {
      console.log("Stopped at provider quota.");
      break;
    }
    const assistant = page.locator(".message.assistant").nth(before);
    await assistant.locator(".answer-content").waitFor({ timeout: 90_000 });
    const answer = await assistant.locator(".answer-content").innerText();
    observations.push({
      caseId: item.id,
      answer,
      retrieved: streamCitations(body),
      latencyMs: Math.round(performance.now() - started),
      review: { answerCorrect: null, citationsSupported: null, abstainedCorrectly: null },
    });
    console.log(`${item.id}: ${observations.at(-1).latencyMs} ms`);
  }

  const output = join(root, "evals/results/latest.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ version: suite.version, baseUrl, observations, summary: scoreEvaluation(suite.cases, observations) }, null, 2) + "\n");
  console.log(`Saved ${observations.length}/${limit} fresh model answers to ${output}. Review correctness and citation support before reporting scores.`);
  console.log(JSON.stringify(scoreEvaluation(suite.cases, observations), null, 2));

  // This browser context started with no cookies, so it owns only this synthetic workspace.
  await page.getByRole("button", { name: "Clear workspace" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Clear workspace" }).click();
  await page.getByText("Your uploaded sources will appear here.").waitFor();
  console.log("Verified synthetic workspace deletion.");
} finally {
  if (entered) await page.request.delete("/api/workspace").catch(() => undefined);
  await browser.close();
}
