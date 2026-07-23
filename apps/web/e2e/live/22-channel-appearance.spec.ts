import { test, expect } from "@playwright/test";
import { channelButton, createChannel, expectInHub, hubApi, uniqueName } from "./helpers/live";

// P22 — channel appearance editing in Channel Settings
// (requires manage_channel_icons; owner is admin).
//
// Since 2026-07-23 the appearance section is a single unified icon grid
// (clear / emoji / SVG upload / hub library / predefined glyphs) and the
// color control only exists for categories (color only ever rendered on
// category headers).

test("set a channel's icon via the unified picker (no color control)", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("look");
  await createChannel(page, channel);
  const row = channelButton(page, channel);
  await row.hover();
  await row.getByRole("button", { name: "Channel settings" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".icon-picker-grid")).toBeVisible();

  // Regular channels have no color control (color renders only on categories).
  await expect(dialog.locator(".color-swatch-row")).toHaveCount(0);

  // Pick an emoji icon through the unified grid's emoji tile.
  await dialog.locator(".icon-picker-emoji-btn").click();
  await page.locator(".reaction-picker-emoji", { hasText: "🎮" }).first().click();

  await dialog.locator(".modal-actions").getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible({ timeout: 10000 });

  const channels = await hubApi<Array<{ name: string; color: string | null; icon: string | null }>>(page, "/channels");
  const ch = channels.find((c) => c.name === channel)!;
  expect(ch.icon).toBe("🎮");
});

test("set a category's color via the category-only swatch picker", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expectInHub(page);

  const category = uniqueName("cat");
  await createChannel(page, category, "Category");
  // Categories render as a group header (SortableItems CategoryHeader), not a
  // channel row — the gear is title="Category settings".
  const group = page.getByRole("group", { name: category });
  await group.locator("button").first().hover();
  await group.getByTitle("Category settings").click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".color-swatch-row")).toBeVisible();
  await dialog.getByTitle("#e74c3c", { exact: true }).click();

  await dialog.locator(".modal-actions").getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible({ timeout: 10000 });

  const channels = await hubApi<Array<{ name: string; color: string | null }>>(page, "/channels");
  const cat = channels.find((c) => c.name === category)!;
  expect(cat.color).toBe("#e74c3c");
});
