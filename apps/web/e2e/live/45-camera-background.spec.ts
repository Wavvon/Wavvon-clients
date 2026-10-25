import { test, expect } from "@playwright/test";
import { expectInHub, openSettingRow } from "./helpers/live";

// P45 — webcam background effects (none/blur/image/video). Actual segmented
// pixels aren't assertable headless, so we cover: the picker + options, the
// preference persistence that App reads on camera-enable, that the camera
// still works with an effect selected, and that the model is served locally
// (self-hosted, no CDN).

async function openCameraSettings(page: import("@playwright/test").Page) {
  await page.locator(".btn-icon-gear").click();
  await page.locator(".settings-nav").getByRole("button", { name: "Camera", exact: true }).click();
}

test("background picker offers none/blur/image/video and persists the choice", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openCameraSettings(page);

  // The picker is in the form the Background row opens to.
  const background = await openSettingRow(page, "Background");
  const select = background.getByLabel("Background effect");
  await expect(select).toBeVisible({ timeout: 10000 });
  await expect(select.locator("option")).toHaveText(["None", "Blur", "Image", "Video"]);

  await select.selectOption("blur");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("wavvon.bgMode")))
    .toBe("blur");
});

test("camera preview still works with blur selected, and the model is self-hosted", async ({ page, baseURL }) => {
  await page.goto("/");
  await expectInHub(page);
  await openCameraSettings(page);

  const background = await openSettingRow(page, "Background");
  await background.getByLabel("Background effect").selectOption("blur");

  // Background and Preview are separate rows and the tab is an accordion, so
  // opening the preview closes the picker — the choice is already saved.
  const preview = await openSettingRow(page, "Preview");
  await preview.getByRole("button", { name: "Preview camera" }).click();
  // Even if segmentation can't load headless, the pipeline falls back to raw
  // video, so a preview <video> must still appear (camera never breaks).
  await expect(preview.locator("video")).toBeVisible({ timeout: 15000 });

  // The MediaPipe model is served from our own origin (no CDN dependency).
  const res = await page.request.get(`${baseURL}/mediapipe/selfie_segmentation.tflite`);
  expect(res.status()).toBe(200);
});
