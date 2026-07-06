import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:1421",
    trace: "on-first-retry",
  },
  projects: [
    // Mock-API tests (no real hub needed). The capture dir is the
    // README-asset generator with its own config — never part of a suite.
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: ["**/live/**", "**/capture/**"],
    },
    // Live tests against a real local hub (see e2e/live/README.md).
    {
      name: "live-setup",
      testMatch: "**/live/live.setup.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "live",
      testMatch: "**/live/**/*.spec.ts",
      dependencies: ["live-setup"],
      fullyParallel: false,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/owner.json",
        permissions: ["microphone", "clipboard-read", "clipboard-write"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            // Let getDisplayMedia() resolve to a fake source without a picker.
            "--auto-select-desktop-capture-source=Entire screen",
            "--autoplay-policy=no-user-gesture-required",
          ],
        },
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1421",
    reuseExistingServer: !process.env.CI,
  },
});
