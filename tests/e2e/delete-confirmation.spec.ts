import { expect, test, type Locator, type Page } from "@playwright/test";

const firstId = "00000000-0000-4000-8000-000000000002";
const secondId = "00000000-0000-4000-8000-000000000003";
const initialDocuments = [
  { id: firstId, name: "guide.pdf", mediaType: "application/pdf", sizeBytes: 2048, status: "ready", chunkCount: 3, createdAt: "2026-01-01T00:00:00Z" },
  { id: secondId, name: "failed.txt", mediaType: "text/plain", sizeBytes: 120, status: "failed", chunkCount: 0, error: "Could not process file.", createdAt: "2026-01-02T00:00:00Z" },
];

async function expectCenteredDialog(dialog: Locator) {
  const layout = await dialog.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const styles = getComputedStyle(element);
    return {
      position: styles.position,
      transform: styles.transform,
      centerX: bounds.left + bounds.width / 2,
      centerY: bounds.top + bounds.height / 2,
      viewportCenterX: window.innerWidth / 2,
      viewportCenterY: window.innerHeight / 2,
    };
  });
  expect(layout.position).toBe("fixed");
  expect(layout.transform).not.toBe("none");
  expect(Math.abs(layout.centerX - layout.viewportCenterX)).toBeLessThanOrEqual(2);
  expect(Math.abs(layout.centerY - layout.viewportCenterY)).toBeLessThanOrEqual(2);
}

async function openWorkspace(page: Page, options: { failDocumentDelete?: boolean; failWorkspaceDelete?: boolean; documentDeleteDelay?: number } = {}) {
  const state = {
    documents: [...initialDocuments],
    documentDeletes: 0,
    workspaceDeletes: 0,
    workspacePosts: 0,
  };

  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "DELETE") {
      state.workspaceDeletes += 1;
      if (options.failWorkspaceDelete) {
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "SERVICE_UNAVAILABLE", message: "Could not clear workspace." } }) });
      }
      state.documents = [];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
    state.workspacePosts += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        limits: { maxFiles: 3, maxFileBytes: 5 * 1024 * 1024, maxPdfPages: 100, questionsPerWorkspacePerDay: 10, webSearchesPerWorkspacePerDay: 3 },
      }),
    });
  });
  await page.route("**/api/documents", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ documents: state.documents }),
  }));
  await page.route("**/api/documents/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    state.documentDeletes += 1;
    if (options.documentDeleteDelay) await new Promise((resolve) => setTimeout(resolve, options.documentDeleteDelay));
    if (options.failDocumentDelete) {
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "SERVICE_UNAVAILABLE", message: "Could not delete document." } }) });
    }
    const id = route.request().url().split("/").pop();
    state.documents = state.documents.filter((document) => document.id !== id);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your documents", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete guide.pdf" })).toBeVisible();
  return state;
}

test("document deletion requires confirmation, including failed documents", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await openWorkspace(page);
  const trigger = page.getByRole("button", { name: "Delete failed.txt" });
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Delete document?" });
  await expect(dialog).toBeVisible();
  await expectCenteredDialog(dialog);
  await expect(dialog).toContainText("failed.txt");
  await expect(dialog).toContainText("searchable chunks");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  expect(state.documentDeletes).toBe(0);

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(state.documentDeletes).toBe(0);

  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(state.documentDeletes).toBe(0);

  await trigger.click();
  await dialog.getByRole("button", { name: "Delete document" }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Your documents", exact: true })).toBeFocused();
  expect(state.documentDeletes).toBe(1);
  expect(state.workspaceDeletes).toBe(0);
});

test("clear workspace confirms on a narrow screen without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const state = await openWorkspace(page);
  const trigger = page.getByRole("button", { name: "Clear workspace" });
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Clear workspace?" });
  await expect(dialog).toBeVisible();
  await expectCenteredDialog(dialog);
  await expect(dialog).toContainText("all 2 uploaded documents");
  await expect(dialog).toContainText("A new empty workspace will be created");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(state.workspaceDeletes).toBe(0);

  await trigger.click();
  await dialog.getByRole("button", { name: "Clear workspace" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Delete guide.pdf" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Your documents", exact: true })).toBeFocused();
  expect(state.workspaceDeletes).toBe(1);
  expect(state.documentDeletes).toBe(0);
  expect(state.workspacePosts).toBe(2);
});

test("deletion cannot be confirmed twice or cancelled while the request is running", async ({ page }) => {
  const state = await openWorkspace(page, { documentDeleteDelay: 700 });
  await page.getByRole("button", { name: "Delete guide.pdf" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete document?" });
  await dialog.getByRole("button", { name: "Delete document" }).click();

  await expect(dialog.getByRole("button", { name: "Deleting…" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(state.documentDeletes).toBe(1);
});

test("delete failures keep documents visible and show the existing notice", async ({ page }) => {
  const state = await openWorkspace(page, { failDocumentDelete: true, failWorkspaceDelete: true });
  await page.getByRole("button", { name: "Delete guide.pdf" }).click();
  await page.getByRole("dialog", { name: "Delete document?" }).getByRole("button", { name: "Delete document" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: "Delete guide.pdf" })).toBeVisible();
  await expect(page.locator(".notice[role='alert']")).toContainText("Could not delete document.");

  await page.getByRole("button", { name: "Clear workspace" }).click();
  await page.getByRole("dialog", { name: "Clear workspace?" }).getByRole("button", { name: "Clear workspace" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: "Delete guide.pdf" })).toBeVisible();
  await expect(page.locator(".notice[role='alert']")).toContainText("Could not clear workspace.");
  expect(state.documentDeletes).toBe(1);
  expect(state.workspaceDeletes).toBe(1);
});
