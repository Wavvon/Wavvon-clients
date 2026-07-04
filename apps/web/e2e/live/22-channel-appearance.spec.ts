import { test, expect } from "@playwright/test";
import { channelButton, createChannel, expectInHub, hubApi, uniqueName } from "./helpers/live";

// P22 — channel appearance (color + icon) editing in Channel Settings
// (requires manage_channel_icons; owner is admin).

test("set a channel's color and icon", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("look");
  await createChannel(page, channel);
  const row = channelButton(page, channel);
  await row.hover();
  await row.getByRole("button", { name: "Channel settings" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Appearance")).toBeVisible();

  // Pick a color from the swatch picker.
  await dialog.getByTitle("#e74c3c", { exact: true }).click();
  // Pick an emoji icon.
  await dialog.getByRole("button", { name: "Add reaction" }).click();
  await page.locator(".reaction-picker-emoji", { hasText: "🎮" }).first().click();

  await dialog.locator(".modal-actions").getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible({ timeout: 10000 });

  // Verify persisted on the hub.
  const channels = await hubApi<Array<{ name: string; color: string | null; icon: string | null }>>(page, "/channels");
  const ch = channels.find((c) => c.name === channel)!;
  expect(ch.color).toBe("#e74c3c");
  expect(ch.icon).toBe("🎮");
});
