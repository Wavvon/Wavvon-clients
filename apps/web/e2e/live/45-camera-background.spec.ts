import { test, expect } from "@playwright/test";
import { expectInHub, startCameraPreview } from "./helpers/live";

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

  const picker = page.getByRole("radiogroup", { name: "Background effect" });
  await expect(picker).toBeVisible({ timeout: 10000 });
  await expect(picker.getByRole("radio")).toHaveText(["None", "Blur", "Image", "Video"]);

  await picker.getByRole("radio", { name: "Blur" }).click();
  await expect(picker.getByRole("radio", { name: "Blur" })).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("wavvon.bgMode")))
    .toBe("blur");
});

test("camera preview still works with blur selected, and the model is self-hosted", async ({ page, baseURL }) => {
  await page.goto("/");
  await expectInHub(page);
  await openCameraSettings(page);

  await page.getByRole("radiogroup", { name: "Background effect" }).getByRole("radio", { name: "Blur" }).click();

  // Even if segmentation can't load headless, the pipeline falls back to raw
  // video, so the preview must still play (camera never breaks).
  await startCameraPreview(page);

  // The MediaPipe model is served from our own origin (no CDN dependency).
  const res = await page.request.get(`${baseURL}/mediapipe/selfie_segmentation.tflite`);
  expect(res.status()).toBe(200);
});
