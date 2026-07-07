import { test, expect } from "@playwright/test";
import { expectInHub } from "./helpers/live";

// P23 — push-to-talk settings (Settings → Voice). The audio gating is a live
// voice-path behavior (hard to observe under fake media), so this verifies
// the setting toggles, binds a key, and persists across a reload.

test("enable push-to-talk and bind a key; it persists", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  await page.locator(".btn-icon-gear").click();
  await page.getByRole("button", { name: "Voice", exact: true }).click();

  await expect(page.getByText("Push-to-talk", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: /Enable push-to-talk/ }).check();

  // Bind a key: click "Change key", then press T.
  await page.getByRole("button", { name: "Change key" }).click();
  await page.keyboard.press("KeyT");
  await expect(page.getByText("Key:", { exact: false })).toContainText("T");

  // Persists across reload.
  await page.reload();
  await expectInHub(page);
  await page.locator(".btn-icon-gear").click();
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /Enable push-to-talk/ })).toBeChecked();
  await expect(page.getByText("Key:", { exact: false })).toContainText("T");
});
