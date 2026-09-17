import { expect, test } from "@playwright/test";

async function showAccessScreen(page: import("@playwright/test").Page) {
  await page.route("**/api/workspace", (route) => route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "ACCESS_REQUIRED", message: "Enter the demo access code to continue." } }),
  }));
  await page.goto("/");
}

for (const viewport of [{ name: "desktop", width: 1280, height: 800 }, { name: "mobile", width: 375, height: 812 }]) {
  test(`shows public demo access without overflow on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await showAccessScreen(page);

    await expect(page.getByRole("heading", { name: "Portfolio Demo Access" })).toBeVisible();
    await expect(page.getByText("thisisdemoaccesscode")).toBeVisible();
    await expect(page.getByLabel("Demo access code", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enter lab" })).toBeVisible();
    await expect(page.getByText(/confidential/i)).toBeVisible();
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

  await page.getByRole("button", { name: "Copy demo access code" }).click();
  await expect(page.getByRole("status")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("thisisdemoaccesscode");
  expect(accessSubmissions).toBe(0);
});
