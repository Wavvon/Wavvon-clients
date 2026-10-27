import { test, expect, type Page } from "@playwright/test";
import { expectInHub, startCameraPreview } from "./helpers/live";

// P43 — Settings → Camera leads with a live preview, and the device and
// background controls sit inline under it (Wavvon-clients#161). Background
// effects are covered by P45 and e2e/camera-background.spec.ts. Fake media is
// provided by the Playwright flags.

async function openCameraSettings(page: Page) {
  await page.locator(".btn-icon-gear").click();
  await page.locator(".settings-nav").getByRole("button", { name: "Camera", exact: true }).click();
}

test("camera tab shows the preview and its controls without opening anything", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openCameraSettings(page);
  await expect(page.getByLabel("Camera device")).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("radiogroup", { name: "Background effect" })).toBeVisible();

  const video = await startCameraPreview(page);
  // A decoded frame, not just an element: videoWidth stays 0 until one exists.
  await expect.poll(() => video.evaluate((v) => (v as HTMLVideoElement).videoWidth), { timeout: 15000 }).toBeGreaterThan(0);
});
