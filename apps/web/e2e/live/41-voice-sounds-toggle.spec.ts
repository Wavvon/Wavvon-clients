import { test, expect } from "@playwright/test";
import { expectInHub, scopedLocalStorageItem } from "./helpers/live";

// P41 — voice join/leave sound cues (#9) have a Settings toggle. Actual audio
// can't be asserted headless, so we cover the preference wiring (default on +
// persistence), which gates the tones App plays on join/leave.

async function openNotifications(page: import("@playwright/test").Page) {
  await page.locator(".btn-icon-gear").click();
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
}

test("voice sounds default on and the toggle is present", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openNotifications(page);
  const cb = page.getByRole("checkbox", { name: "Play voice join/leave sounds" }).first();
  await expect(cb).toBeVisible({ timeout: 10000 });
  await expect(cb).toBeChecked();
});

test("disabling voice sounds persists to localStorage", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openNotifications(page);
  const cb = page.getByRole("checkbox", { name: "Play voice join/leave sounds" }).first();
  await cb.uncheck();
  await expect
    .poll(() => scopedLocalStorageItem(page, "wavvon.voiceSounds"))
    .toBe("0");
});
