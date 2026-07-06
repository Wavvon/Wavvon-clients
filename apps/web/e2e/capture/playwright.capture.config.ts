import { defineConfig } from "@playwright/test";

// Dedicated config for the README-asset capture (see readme-assets.spec.ts).
// Kept out of the main config's projects so `playwright test` never runs
// the capture by accident.
export default defineConfig({
  testDir: ".",
  timeout: 600000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:1421",
    actionTimeout: 20000,
    deviceScaleFactor: 2,
    viewport: { width: 1600, height: 1000 },
    permissions: ["microphone"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
});
