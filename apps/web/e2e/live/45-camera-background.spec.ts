import { test, expect } from "@playwright/test";
import { expectInHub } from "./helpers/live";

// P45 — webcam background effects (none/blur/image/video). Actual segmented
// pixels aren't assertable headless, so we cover: the picker + options, the
// preference persistence that App reads on camera-enable, that the camera
// still works with an effect selected, and that the model is served locally
// (self-hosted, no CDN).

async function openVoiceSettings(page: import("@playwright/test").Page) {
  await page.locator(".btn-icon-gear").click();
  await page.getByRole("button", { name: "Voice", exact: true }).click();
}

test("background picker offers none/blur/image/video and persists the choice", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openVoiceSettings(page);

  const select = page.getByLabel("Background effect").first();
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
  await openVoiceSettings(page);

  const section = page
    .locator(".settings-section", { has: page.getByText("Camera", { exact: true }) })
    .first();
  await section.getByLabel("Background effect").selectOption("blur");
  await section.getByRole("button", { name: "Preview camera" }).click();
  // Even if segmentation can't load headless, the pipeline falls back to raw
  // video, so a preview <video> must still appear (camera never breaks).
  await expect(section.locator("video")).toBeVisible({ timeout: 15000 });

  // The MediaPipe model is served from our own origin (no CDN dependency).
  const res = await page.request.get(`${baseURL}/mediapipe/selfie_segmentation.tflite`);
  expect(res.status()).toBe(200);
});
