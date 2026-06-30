const { defineConfig } = require("@playwright/test");

// Chrome extensions only load in a persistent context, which can't be shared
// across parallel workers — so the e2e suite runs serially.
module.exports = defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.js",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30000,
  expect: { timeout: 7000 }
});
