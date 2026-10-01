import { test, expect } from "@playwright/test";
import { expectInHub, openSettingRow, settingRow } from "./helpers/live";

// P23 — push-to-talk settings (Settings → Voice). The audio gating is a live
// voice-path behavior (hard to observe under fake media), so this verifies
// the setting toggles, binds a key, and persists across a reload.

async function openVoiceSettings(page: import("@playwright/test").Page) {
  await page.locator(".btn-icon-gear").click();
  await page.locator(".settings-nav").getByRole("button", { name: "Voice", exact: true }).click();
}

test("enable push-to-talk and bind a key; it persists", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openVoiceSettings(page);

  // Push-to-talk is a settings row: it states whether it is on, and opens to
  // the controls that change it.
  const ptt = await openSettingRow(page, "Push-to-talk");
  await ptt.getByRole("checkbox", { name: /Enable push-to-talk/ }).check();

  // Bind a key: click "Change key", then press T.
  await ptt.getByRole("button", { name: "Change key" }).click();
  await page.keyboard.press("KeyT");
  await expect(ptt.getByText("Key:", { exact: false })).toContainText("T");

  // Persists across reload — and the row says so without being opened, which
  // is the point of the row stating what it is set to.
  await page.reload();
  await expectInHub(page);
  await openVoiceSettings(page);
  await expect(settingRow(page, "Push-to-talk").locator(".setting-row-state")).toHaveText(
    "Hold T to transmit",
    { timeout: 10000 },
  );
  const again = await openSettingRow(page, "Push-to-talk");
  await expect(again.getByRole("checkbox", { name: /Enable push-to-talk/ })).toBeChecked();
});
