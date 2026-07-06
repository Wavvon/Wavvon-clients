import { test, expect } from "@playwright/test";
import { expectInHub } from "./helpers/live";

// P43 — camera device picker + live preview (Settings → Voice, #6). Background
// blur is deferred (heavy ML). Fake media is provided by the Playwright flags.

async function openVoiceSettings(page: import("@playwright/test").Page) {
  await page.locator(".btn-icon-gear").click();
  await page.getByRole("button", { name: "Voice & Video", exact: true }).click();
}

test("camera section shows a device picker and preview control", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openVoiceSettings(page);
  await expect(page.getByLabel("Camera device").first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("button", { name: "Preview camera" }).first()).toBeVisible();
});

test("previewing the camera shows a live video element", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openVoiceSettings(page);
  const section = page
    .locator(".settings-section", { has: page.getByText("Camera", { exact: true }) })
    .first();
  await section.getByRole("button", { name: "Preview camera" }).click();
  // The <video> becomes visible and a "Stop preview" control appears.
  await expect(section.locator("video")).toBeVisible({ timeout: 10000 });
  await expect(section.getByRole("button", { name: "Stop preview" })).toBeVisible();
});
