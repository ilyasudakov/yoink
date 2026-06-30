const { test, expect } = require("./fixtures");

test.beforeEach(async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
});

test("popup renders both sections with localhost defaults", async ({ page }) => {
  await expect(page.locator(".section-label", { hasText: "Source hosts" })).toBeVisible();
  await expect(page.locator(".section-label", { hasText: "Destinations" })).toBeVisible();

  // localhost / 127.0.0.1 ship as default destinations.
  const destUrls = page.locator("#destinations .host-url");
  await expect(destUrls.filter({ hasText: "localhost" })).toBeVisible();
  await expect(destUrls.filter({ hasText: "127.0.0.1" })).toBeVisible();

  // No source hosts by default.
  await expect(page.locator("#hosts .empty")).toBeVisible();
});

test("adding a destination shows it in the list", async ({ page }) => {
  await page.fill("#new-destination", "app-*.staging.example.com");
  await page.click("#add-dest-btn");

  await expect(
    page.locator("#destinations .host-url", { hasText: "app-*.staging.example.com" })
  ).toBeVisible();
  // Input clears on success.
  await expect(page.locator("#new-destination")).toHaveValue("");
});

test("an invalid destination is rejected", async ({ page }) => {
  const before = await page.locator("#destinations .host").count();
  await page.fill("#new-destination", "bad host with spaces");
  await page.click("#add-dest-btn");

  await expect(page.locator("#toast")).toContainText("Invalid pattern");
  await expect(page.locator("#destinations .host")).toHaveCount(before);
});

test("adding a source host shows it in the list", async ({ page }) => {
  await page.fill("#new-host", "app.staging.example.com");
  await page.click("#add-btn");

  await expect(
    page.locator("#hosts .host-url", { hasText: "app.staging.example.com" })
  ).toBeVisible();
});

test("a destination can be paused", async ({ page }) => {
  const row = page.locator("#destinations .host", { hasText: "localhost" }).first();
  await expect(row).toHaveAttribute("data-paused", "false");

  await row.locator('[data-action="dest-pause"]').click();
  await expect(row).toHaveAttribute("data-paused", "true");
});

test("state persists across popup reloads", async ({ page }) => {
  await page.fill("#new-destination", "qa.example.com");
  await page.click("#add-dest-btn");
  await expect(page.locator("#destinations .host-url", { hasText: "qa.example.com" })).toBeVisible();

  await page.reload();
  await expect(page.locator("#destinations .host-url", { hasText: "qa.example.com" })).toBeVisible();
});
