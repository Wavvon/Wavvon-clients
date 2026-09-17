import { defineConfig, devices } from "@playwright/test";

// Where the app is served. Overridable so a CI job can bring its own vite,
// or point the suite at a hub serving its own baked-in client.
const APP_URL = process.env.WAVVON_E2E_APP_URL ?? "http://localhost:1421";
const APP_PORT = new URL(APP_URL).port || "1421";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One retry, not two. The live project runs serially, so every failed spec
  // costs its full timeout again — a broken run used to spend an hour past
  // the 13 minutes a green one takes, and the second retry never once turned
  // a real failure into a pass.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: APP_URL,
    // Every failed attempt keeps its trace. "on-first-retry" recorded the
    // retry instead, so a spec that failed once and passed on retry left a
    // trace of the run that passed and the failure itself was undiagnosable.
    trace: "retain-on-failure",
  },
  projects: [
    // Mock-API tests (no real hub needed). The capture dir is the
    // README-asset generator with its own config — never part of a suite.
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: ["**/live/**", "**/desktop/**", "**/capture/**"],
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
    // Web ↔ desktop tests. Same live hub, but one side is the real Tauri app
    // driven over CDP (e2e/desktop/README.md). Never in CI: it builds and
    // opens a desktop window, and the desktop client is not the delivery
    // target — this is the harness for verifying by hand what only breaks
    // between two different clients.
    {
      name: "desktop",
      testMatch: "**/desktop/**/*.spec.ts",
      dependencies: ["live-setup"],
      fullyParallel: false,
      // `beforeAll` gets the test timeout, and launching the app compiles the
      // Rust shell on a cold target directory — minutes, not seconds. The
      // helper already waits 300s for the debug port; without this the hook
      // was killed at the 30s default long before it could.
      timeout: 600_000,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/owner.json",
      },
    },
  ],
  // CI serves a production build. Under the dev server the first interaction
  // with any not-yet-transformed module waits on Vite compiling it, which on a
  // two-core runner is seconds per menu or modal and is what turned 65 of 85
  // live specs flaky there while they stayed green on a fast local machine.
  webServer: {
    command: process.env.CI
      ? `npm run build && npm run preview -- --port ${APP_PORT} --strictPort`
      : "npm run dev",
    url: APP_URL,
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 300_000 : 60_000,
  },
});
