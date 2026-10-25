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
    // The README is English and every selector here is an English label, so
    // the capture cannot inherit the machine's locale: i18next picks the
    // browser language, and on an Italian box the first click misses and
    // every step after it cascades into a timeout that looks like a changed
    // UI. Pinning it also makes the assets reproducible on any machine.
    locale: "en-US",
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
