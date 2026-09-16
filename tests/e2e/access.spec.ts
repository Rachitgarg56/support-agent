import { expect, test } from "@playwright/test";

test("shows the protected portfolio entry point", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/portfolio lab/i)).toBeVisible();
  await expect(page.getByText(/confidential/i)).toBeVisible();
});
