import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { expect, test, type Page, type Route } from "@playwright/test";

import type { AppUIMessage } from "../../lib/types";

const workspace = {
  workspaceId: "00000000-0000-4000-8000-000000000001",
  limits: { maxFiles: 3, maxFileBytes: 5 * 1024 * 1024, maxPdfPages: 100, questionsPerWorkspacePerDay: 10, webSearchesPerWorkspacePerDay: 3 },
};

async function openChat(page: Page) {
  await page.route("**/api/workspace", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(workspace) }));
  await page.route("**/api/documents", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ documents: [{ id: "doc-1", name: "guide.pdf", mediaType: "application/pdf", sizeBytes: 2048, status: "ready", chunkCount: 4, createdAt: "2026-01-01T00:00:00Z" }] }),
  }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Ask your sources." })).toBeVisible();
}

async function fulfillChat(route: Route, kind: "document" | "missing" | "web") {
  const stream = createUIMessageStream<AppUIMessage>({
    execute({ writer }) {
      if (kind === "document") {
        writer.write({ type: "data-citations", data: { items: [
          { id: "1", type: "document", documentId: "doc-1", fileName: "guide.pdf", pageNumber: 2, excerpt: "Starter workspaces can make 1,000 API requests per hour.", similarity: 0.9 },
          { id: "2", type: "document", documentId: "doc-1", fileName: "guide.pdf", pageNumber: 2, excerpt: "Data retention and deletion policy.", similarity: 0.7 },
        ] } });
      }
      writer.write({ type: "data-retrieval", data: { status: kind === "missing" ? "no_match" : kind === "web" ? "web" : "matched", canSearchWeb: kind === "missing", question: "What is the starter limit?" } });
      writer.write({ type: "text-start", id: "answer" });
      writer.write({ type: "text-delta", id: "answer", delta: kind === "document" ? "**Starter** workspaces allow 1,000 API requests per hour [1].\n\n- Limits reset hourly." : kind === "missing" ? "Not found in your documents." : "The current information is on the web." });
      writer.write({ type: "text-end", id: "answer" });
      if (kind === "web") writer.write({ type: "source-url", sourceId: "web-1", url: "https://example.com/limits", title: "Current limits" });
    },
  });
  const response = createUIMessageStreamResponse({ stream });
  await route.fulfill({ status: 200, headers: Object.fromEntries(response.headers), body: await response.text() });
}

for (const width of [1440, 375, 320]) {
  test(`renders one answer and only cited sources at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.route("**/api/chat", (route) => fulfillChat(route, "document"));
    await openChat(page);
    await page.getByPlaceholder("Ask a question about your documents…").fill("What is the starter limit?");
    await page.getByRole("button", { name: "Send message" }).click();

    const assistant = page.locator(".message.assistant");
    await expect(assistant).toHaveCount(1);
    await expect(assistant.locator(".answer-content strong")).toHaveText("Starter");
    await expect(assistant.locator(".answer-content li")).toHaveText("Limits reset hourly.");
    await expect(assistant.locator(".citations")).toHaveCount(1);
    await expect(assistant.locator(".citations details")).toHaveCount(1);
    await expect(assistant.locator(".citations details")).toContainText("guide.pdf · p. 2");
    const answerBox = await assistant.locator(".answer-content").boundingBox();
    const sourcesBox = await assistant.locator(".citations").boundingBox();
    expect(answerBox && sourcesBox && answerBox.y < sourcesBox.y).toBeTruthy();
    await assistant.getByRole("link", { name: "View source 1" }).click();
    await expect(assistant.locator(".citations details")).toHaveAttribute("open", "");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test("shows the web fallback and its links only after explicit search", async ({ page }) => {
  let webRequests = 0;
  await page.route("**/api/chat", async (route) => {
    const kind = route.request().postDataJSON().allowWebSearch ? "web" : "missing";
    if (kind === "web") webRequests += 1;
    await fulfillChat(route, kind);
  });
  await openChat(page);
  await page.getByPlaceholder("Ask a question about your documents…").fill("What is the starter limit?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("button", { name: "Search the web instead" })).toBeVisible();
  expect(webRequests).toBe(0);
  await page.getByRole("button", { name: "Search the web instead" }).click();
  await expect(page.locator(".message.assistant")).toHaveCount(2);
  await expect(page.locator(".web-sources")).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Current limits/ })).toHaveAttribute("href", "https://example.com/limits");
  expect(webRequests).toBe(1);
});
