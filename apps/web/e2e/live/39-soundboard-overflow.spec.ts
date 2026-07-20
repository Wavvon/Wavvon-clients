import { test, expect } from "@playwright/test";
import { channelButton, createChannel, expectInHub, uniqueName } from "./helpers/live";

// P39 — the soundboard popover must stay within the viewport. It anchored its
// right edge to a sidebar button (pushing a 320px popup off the left edge) and
// had no max-height (a long clip list spilled past the screen).

async function openSoundboard(page: import("@playwright/test").Page) {
  const ch = uniqueName("sb");
  await createChannel(page, ch);
  // The soundboard lives in the voice-session footer — a channel row is
  // joined by double-click (see the "Double-click to join voice" row
  // tooltip in SortableItems.tsx), not a header button.
  await channelButton(page, ch).dblclick();
  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${ch}`, { timeout: 15000 });
  const btn = page.getByRole("button", { name: "Soundboard" }).first();
  await expect(btn).toBeVisible({ timeout: 15000 });
  await btn.click();
  const popup = page.locator(".reaction-picker-popup").first();
  await expect(popup).toBeVisible({ timeout: 5000 });
  return popup;
}

test("soundboard popover opens within the horizontal viewport", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  const popup = await openSoundboard(page);
  const box = (await popup.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
});

test("soundboard popover stays within the vertical viewport", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  const popup = await openSoundboard(page);
  const box = (await popup.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
});
