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
    // Mock-API tests (no real hub needed).
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: "**/live/**",
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
