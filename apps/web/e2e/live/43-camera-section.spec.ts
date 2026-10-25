import { test, expect } from "@playwright/test";
import { expectInHub, openSettingRow, settingRow } from "./helpers/live";

// P43 — camera device picker + live preview (Settings → Camera, #6). Background
// effects are covered by P45 and e2e/camera-background.spec.ts. Fake media is
// provided by the Playwright flags.

async function openCameraSettings(page: import("@playwright/test").Page) {
  await page.locator(".btn-icon-gear").click();
  await page.locator(".settings-nav").getByRole("button", { name: "Camera", exact: true }).click();
}

test("camera section shows a device picker and preview control", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openCameraSettings(page);
  // Device and preview are separate settings rows, and each control is in the
  // form its own row opens to. The tab is an accordion, so one at a time.
  const device = await openSettingRow(page, "Camera");
  await expect(device.getByLabel("Camera device")).toBeVisible({ timeout: 10000 });
  await expect(settingRow(page, "Preview")).toBeVisible();
  const preview = await openSettingRow(page, "Preview");
  await expect(preview.getByRole("button", { name: "Preview camera" })).toBeVisible();
});

test("previewing the camera shows a live video element", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openCameraSettings(page);
  const preview = await openSettingRow(page, "Preview");
  await preview.getByRole("button", { name: "Preview camera" }).click();
  // The <video> becomes visible and a "Stop preview" control appears.
  await expect(preview.locator("video")).toBeVisible({ timeout: 10000 });
  await expect(preview.getByRole("button", { name: "Stop preview" })).toBeVisible();
});
