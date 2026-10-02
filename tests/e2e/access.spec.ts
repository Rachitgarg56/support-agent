import { expect, test } from "@playwright/test";

const publicDemoCode = "thisisdemoaccesscode";
const workspace = {
  workspaceId: "00000000-0000-4000-8000-000000000001",
  limits: {
    maxFiles: 3,
    maxFileBytes: 5 * 1024 * 1024,
    maxPdfPages: 100,
    questionsPerWorkspacePerDay: 10,
    webSearchesPerWorkspacePerDay: 3,
  },
};

async function showAccessScreen(page: import("@playwright/test").Page) {
  await page.route("**/api/workspace", (route) => route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "ACCESS_REQUIRED", message: "Enter the demo access code to continue." } }),
  }));
  await page.goto("/");
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 375, height: 812 },
  { name: "narrow mobile", width: 320, height: 700 },
]) {
  test(`shows public demo access without overflow on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await showAccessScreen(page);

    await expect(page.getByRole("heading", { name: "Answers you can trace back to the source." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Explore Papertrail" })).toBeVisible();
    await expect(page.getByText("PUBLIC PORTFOLIO DEMO")).toBeVisible();
    await expect(page.getByText(publicDemoCode)).toBeVisible();
    await expect(page.getByRole("button", { name: "Enter demo" })).toBeVisible();
    await expect(page.getByText("Enter a code manually")).toBeVisible();
    await expect(page.getByLabel("Access code", { exact: true })).toBeHidden();
    await expect(page.locator(".form-error")).toHaveCount(0);
    await expect(page.getByText(/confidential/i)).toBeVisible();
    await page.getByText("Enter a code manually").click();
    await expect(page.getByLabel("Access code", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}

test("copies the public code without submitting the access form", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  let accessSubmissions = 0;
  await page.route("**/api/demo-access", (route) => {
    accessSubmissions += 1;
    return route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
  });
  await showAccessScreen(page);

  const copyButton = page.getByRole("button", { name: "Copy demo access code" });
  await page.keyboard.press("Tab");
  await copyButton.focus();
  await expect(copyButton).toBeFocused();
  await expect(copyButton).toHaveCSS("outline-style", "solid");
  await copyButton.click();
  await expect(page.getByRole("status")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(publicDemoCode);
  expect(accessSubmissions).toBe(0);
});

test("opens the demo only after the primary button submits the public code", async ({ page }) => {
  let accessSubmissions = 0;
  let hasAccess = false;
  await page.route("**/api/workspace", (route) => route.fulfill({
    status: hasAccess ? 200 : 401,
    contentType: "application/json",
    body: JSON.stringify(hasAccess ? workspace : { error: { code: "ACCESS_REQUIRED", message: "Enter the demo access code to continue." } }),
  }));
  await page.route("**/api/demo-access", (route) => {
    accessSubmissions += 1;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ code: publicDemoCode });
    hasAccess = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.route("**/api/documents", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ documents: [] }),
  }));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Explore Papertrail" })).toBeVisible();
  expect(accessSubmissions).toBe(0);
  await page.getByRole("button", { name: "Enter demo" }).click();
  await expect(page.getByRole("heading", { name: "Ask your sources." })).toBeVisible();
  expect(accessSubmissions).toBe(1);
});

test("manual entry keeps server-side invalid-code feedback", async ({ page }) => {
  let submittedCode = "";
  await page.route("**/api/demo-access", (route) => {
    submittedCode = route.request().postDataJSON().code;
    return route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "INVALID_ACCESS_CODE", message: "That access code is not valid." } }),
    });
  });
  await showAccessScreen(page);

  await page.getByText("Enter a code manually").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Access code", { exact: true })).toBeVisible();
  await page.getByLabel("Access code", { exact: true }).fill("wrong-code");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator(".form-error[role='alert']")).toHaveText("That access code is not valid.");
  expect(submittedCode).toBe("wrong-code");
});

test("shows maintenance resources and hides entry actions when unavailable", async ({ page }) => {
  await page.route("**/api/workspace", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "DEMO_DISABLED", message: "The live demo is temporarily disabled." } }),
  }));
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "The demo is resting." })).toBeVisible();
  await expect(page.getByText("The live demo is temporarily disabled.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter demo" })).toHaveCount(0);
  await expect(page.getByText(publicDemoCode)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Source code/ })).toBeVisible();
  await expect(page.getByText(/confidential/i)).toBeVisible();
});

test("logs out without deleting the workspace and restores it after re-entry", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  let logoutRequests = 0;
  let workspaceDeletes = 0;

  await page.route("**/api/workspace", (route) => {
    if (route.request().method() === "DELETE") {
      workspaceDeletes += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(workspace),
    });
  });
  await page.route("**/api/documents", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ documents: [] }),
  }));
  await page.route("**/api/demo-access", (route) => {
    if (route.request().method() === "DELETE") logoutRequests += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/");
  const logoutButton = page.getByRole("button", { name: "Log out" });
  await expect(logoutButton).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  await logoutButton.click();
  await expect(page.getByRole("heading", { name: "Explore Papertrail" })).toBeVisible();
  expect(logoutRequests).toBe(1);
  expect(workspaceDeletes).toBe(0);

  await page.getByText("Enter a code manually").click();
  await page.getByLabel("Access code", { exact: true }).fill(publicDemoCode);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Ask your sources." })).toBeVisible();
});
