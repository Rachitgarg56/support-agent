import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { expect, test, type Page, type Route } from "@playwright/test";

import type { AppUIMessage, DocumentSummary } from "../../lib/types";

const limits = {
  maxFiles: 3,
  maxFileBytes: 5 * 1024 * 1024,
  maxPdfPages: 100,
  questionsPerWorkspacePerDay: 10,
  webSearchesPerWorkspacePerDay: 3,
};

function mockDocument(name: string, status: DocumentSummary["status"], index: number): DocumentSummary {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name,
    mediaType: name.endsWith(".pdf") ? "application/pdf" : "text/plain",
    sizeBytes: 2048,
    status,
    chunkCount: status === "ready" ? 3 : 0,
    ...(status === "failed" ? { error: "Could not extract readable text." } : {}),
    createdAt: "2026-01-01T00:00:00Z",
  };
}

async function openWorkspace(
  page: Page,
  initialDocuments: DocumentSummary[],
  failures: { documentDelete?: boolean; workspaceDelete?: boolean } = {},
) {
  const state = {
    documents: [...initialDocuments],
    documentDeletes: 0,
    workspaceDeletes: 0,
    retries: 0,
  };

  await page.route("**/api/workspace", (route) => {
    if (route.request().method() === "DELETE") {
      state.workspaceDeletes += 1;
      if (failures.workspaceDelete) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "SERVICE_UNAVAILABLE", message: "Could not clear workspace." } }),
        });
      }
      state.documents = [];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ workspaceId: "00000000-0000-4000-8000-000000000001", limits }),
    });
  });
  await page.route("**/api/documents", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ documents: state.documents }),
  }));
  await page.route("**/api/documents/*/process", (route) => {
    state.retries += 1;
    const id = route.request().url().split("/").at(-2);
    state.documents = state.documents.map((item) => item.id === id ? { ...item, status: "ready", chunkCount: 3, error: undefined } : item);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ready" }) });
  });
  await page.route("**/api/documents/*", (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    state.documentDeletes += 1;
    if (failures.documentDelete) {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "SERVICE_UNAVAILABLE", message: "Could not delete document." } }),
      });
    }
    const id = route.request().url().split("/").at(-1);
    state.documents = state.documents.filter((item) => item.id !== id);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Ask your documents." })).toBeVisible();
  return state;
}

async function answerQuestion(page: Page) {
  await page.route("**/api/chat", async (route: Route) => {
    const stream = createUIMessageStream<AppUIMessage>({
      execute({ writer }) {
        writer.write({ type: "data-citations", data: { items: [
          {
            id: "1",
            type: "document",
            documentId: "00000000-0000-4000-8000-000000000002",
            fileName: "guide.pdf",
            pageNumber: 2,
            excerpt: "Starter workspaces allow 1,000 requests each hour.",
            similarity: 0.92,
          },
        ] } });
        writer.write({ type: "data-retrieval", data: { status: "matched", canSearchWeb: false, question: "What is the limit?" } });
        writer.write({ type: "text-start", id: "answer" });
        writer.write({ type: "text-delta", id: "answer", delta: "**Starter** allows 1,000 requests each hour [1]." });
        writer.write({ type: "text-end", id: "answer" });
      },
    });
    const response = createUIMessageStreamResponse({ stream });
    await route.fulfill({ status: 200, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  await page.locator(".composer textarea").fill("What is the limit?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".message.assistant .answer-content")).toContainText("1,000 requests each hour");
  await expect(page.locator(".message.assistant .citations details")).toHaveCount(1);
}

test("empty mobile workspace makes upload and privacy guidance prominent", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openWorkspace(page, []);

  const toggle = page.locator(".mobile-document-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toHaveAttribute("aria-controls", "document-panel-details");
  await expect(page.getByRole("button", { name: "Hide documents" })).toBeVisible();
  await expect(page.locator(".document-panel-details")).toBeVisible();
  await expect(page.locator(".drop-zone")).toBeEnabled();
  await expect(page.locator(".privacy-note")).toContainText(/do not upload confidential/i);
  await expect(page.getByRole("link", { name: /Source code/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await expect(page.locator(".suggestions button")).toHaveCount(0);
  await expect(page.locator(".composer textarea")).toBeDisabled();
  await expect(page.locator(".composer-meta")).toContainText("0/2000");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test("waiting, processing, and failed documents have readable statuses and retry", async ({ page }) => {
  const failed = mockDocument("failed.txt", "failed", 4);
  const state = await openWorkspace(page, [
    mockDocument("waiting.md", "pending", 2),
    mockDocument("working.pdf", "processing", 3),
    failed,
  ]);

  for (const [name, status] of [["waiting.md", "Waiting"], ["working.pdf", "Processing"], ["failed.txt", "Failed"]]) {
    const card = page.locator(".document-card").filter({ hasText: name });
    await expect(card.locator(".status-badge")).toHaveText(status);
  }
  await expect(page.locator(".document-card").filter({ hasText: "failed.txt" })).toContainText("Could not extract readable text.");
  await expect(page.locator(".suggestions button")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry failed.txt" }).click();
  await expect(page.locator(".document-card").filter({ hasText: "failed.txt" }).locator(".status-badge")).toHaveText("Ready");
  expect(state.retries).toBe(1);
});

test("a ready document collapses the mobile list while keeping chat and upload reachable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openWorkspace(page, [mockDocument("guide.pdf", "ready", 2)]);

  const toggle = page.getByRole("button", { name: "Show documents" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".document-panel-details")).toBeHidden();
  await expect(page.locator(".suggestions button")).toHaveCount(2);
  await expect(page.locator(".composer textarea")).toBeEnabled();
  await expect(page.getByRole("button", { name: "Add file" })).toBeVisible();
  if (process.env.PAPERTRAIL_CAPTURE_UI === "1") {
    await page.screenshot({ path: test.info().outputPath("workspace-mobile-320.png"), fullPage: true });
  }
  await toggle.focus();
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Hide documents" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".document-panel-details")).toBeVisible();
  await expect(page.locator(".document-card .status-badge")).toHaveText("Ready");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("full workspace communicates the limit before upload", async ({ page }) => {
  await openWorkspace(page, [mockDocument("one.pdf", "ready", 2), mockDocument("two.pdf", "ready", 3), mockDocument("three.pdf", "ready", 4)]);
  await expect(page.locator(".drop-zone")).toBeDisabled();
  await expect(page.locator(".document-panel")).toContainText(/3\s*\/\s*3/);
  await expect(page.locator(".document-panel")).toContainText("Workspace is full");
});

test("upload action exposes a busy state and recovers from API failure", async ({ page }) => {
  let releaseUpload!: () => void;
  const uploadGate = new Promise<void>((resolve) => { releaseUpload = resolve; });
  await page.route("**/api/documents/upload-url", async (route) => {
    await uploadGate;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "SERVICE_UNAVAILABLE", message: "Upload is temporarily unavailable." } }),
    });
  });
  await openWorkspace(page, []);
  await page.locator('input[type="file"]').setInputFiles({ name: "test.md", mimeType: "text/markdown", buffer: Buffer.from("A fictional test document.") });
  await expect(page.locator(".drop-zone")).toBeDisabled();
  await expect(page.locator(".document-panel")).toContainText(/uploading|processing/i);
  releaseUpload();
  await expect(page.locator(".notice[role='alert']")).toContainText("Upload is temporarily unavailable.");
  await expect(page.locator(".drop-zone")).toBeEnabled();
});

test("draft count tracks the current question and cited answer remains readable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkspace(page, [mockDocument("guide.pdf", "ready", 2)]);
  await expect(page.locator(".document-card")).toHaveCount(1);
  if (process.env.PAPERTRAIL_CAPTURE_UI === "1") {
    await page.screenshot({ path: test.info().outputPath("workspace-desktop-1440.png"), fullPage: true });
  }
  const draft = "What is the limit?";
  await page.locator(".composer textarea").fill(draft);
  await expect(page.locator(".composer-meta")).toContainText(`${draft.length}/2000`);
  await expect(page.locator(".composer-meta")).toContainText("No chat history is stored");
  await answerQuestion(page);
  await expect(page.locator(".composer-meta")).toContainText("0/2000");
  await expect(page.locator(".message.assistant .answer-content strong")).toHaveText("Starter");
  await expect(page.getByRole("link", { name: "View source 1" })).toBeVisible();
  await expect(page.locator(".message.assistant .citations")).toHaveCount(1);
});

for (const action of ["document", "workspace"] as const) {
  test(`successful ${action} deletion clears only client-side chat`, async ({ page }) => {
    const state = await openWorkspace(page, [mockDocument("guide.pdf", "ready", 2)]);
    await answerQuestion(page);
    if (action === "document") {
      await page.getByRole("button", { name: "Delete guide.pdf" }).click();
      await page.getByRole("dialog", { name: "Delete document?" }).getByRole("button", { name: "Delete document" }).click();
    } else {
      await page.getByRole("button", { name: "Clear workspace" }).click();
      await page.getByRole("dialog", { name: "Clear workspace?" }).getByRole("button", { name: "Clear workspace" }).click();
    }
    await expect(page.locator(".message.assistant")).toHaveCount(0);
    await expect(page.locator(".message.user")).toHaveCount(0);
    await expect(page.locator(".citations")).toHaveCount(0);
    await expect(page.locator(".document-card")).toHaveCount(0);
    expect(state.documentDeletes).toBe(action === "document" ? 1 : 0);
    expect(state.workspaceDeletes).toBe(action === "workspace" ? 1 : 0);
  });
}

test("failed deletion preserves the answer and its citation", async ({ page }) => {
  const state = await openWorkspace(page, [mockDocument("guide.pdf", "ready", 2)], { documentDelete: true });
  await answerQuestion(page);
  await page.getByRole("button", { name: "Delete guide.pdf" }).click();
  await page.getByRole("dialog", { name: "Delete document?" }).getByRole("button", { name: "Delete document" }).click();
  await expect(page.locator(".notice[role='alert']")).toContainText("Could not delete document.");
  await expect(page.locator(".message.assistant .answer-content")).toContainText("1,000 requests each hour");
  await expect(page.locator(".message.assistant .citations details")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Delete guide.pdf" })).toBeVisible();
  expect(state.documentDeletes).toBe(1);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 800 },
  { width: 375, height: 812 },
  { width: 320, height: 700 },
]) {
  test(`workspace and deletion dialog fit ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openWorkspace(page, [
      mockDocument("guide.pdf", "ready", 2),
      mockDocument("working.md", "processing", 3),
      mockDocument("failed.txt", "failed", 4),
    ]);

    const composer = page.getByRole("textbox", { name: "Ask a question about your documents" });
    await expect(composer).toBeVisible();
    const composerBox = await composer.boundingBox();
    expect(composerBox).not.toBeNull();
    expect(composerBox!.y).toBeLessThan(viewport.height);
    if (viewport.width <= 375) {
      const composerWrap = await page.locator(".composer-wrap").boundingBox();
      expect(composerWrap).not.toBeNull();
      for (const suggestion of await page.locator(".suggestions button").all()) {
        const suggestionBox = await suggestion.boundingBox();
        expect(suggestionBox).not.toBeNull();
        expect(suggestionBox!.y + suggestionBox!.height).toBeLessThanOrEqual(composerWrap!.y);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    if (process.env.PAPERTRAIL_CAPTURE_UI === "1") {
      await page.screenshot({ path: test.info().outputPath(`workspace-${viewport.width}-initial.png`) });
    }

    if (viewport.width < 1024) {
      const toggle = page.getByRole("button", { name: "Show documents" });
      await expect(toggle).toBeVisible();
      await toggle.click();
    }
    await expect(page.locator(".document-card")).toHaveCount(3);
    await expect(page.locator(".document-card .status-badge")).toHaveText(["Ready", "Processing", "Failed"]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    if (process.env.PAPERTRAIL_CAPTURE_UI === "1") {
      await page.screenshot({ path: test.info().outputPath(`workspace-${viewport.width}-documents.png`), fullPage: true });
    }

    await page.getByRole("button", { name: "Delete guide.pdf" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete document?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    if (process.env.PAPERTRAIL_CAPTURE_UI === "1") {
      await page.screenshot({ path: test.info().outputPath(`workspace-${viewport.width}-dialog.png`) });
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
}
