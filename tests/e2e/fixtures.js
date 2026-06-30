const path = require("path");
const { test: base, chromium, expect } = require("@playwright/test");

// Repo root holds manifest.json — load the whole folder as an unpacked extension.
const pathToExtension = path.join(__dirname, "..", "..");

// Extensions require a persistent context. `channel: "chromium"` selects the
// full build, whose new headless mode supports extensions (the headless shell
// does not), so the suite runs headless locally and in CI without a display.
const test = base.extend({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        "--no-sandbox"
      ]
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent("serviceworker");
    const extensionId = sw.url().split("/")[2];
    await use(extensionId);
  }
});

module.exports = { test, expect };
