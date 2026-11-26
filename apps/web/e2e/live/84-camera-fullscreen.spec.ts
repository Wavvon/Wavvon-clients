import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P84 — one camera can go fullscreen from its tile (#489).
//
// Cameras show in their owners' tiles; to look at one closely a member opens
// it fullscreen from the tile. The claim is the browser's own: the element in
// fullscreen is that tile's video.

async function joinVoiceAndEnableCamera(page: Page, channel: string) {
  // Share screen and camera both live in the voice-session footer — a
  // channel row is joined by double-click (see the "Double-click to join
  // voice" row tooltip in SortableItems.tsx), not a header button.
  await channelButton(page, channel).dblclick();
  await expect(page.locator(".voice-status-room").first()).toHaveText(`${channel}`, { timeout: 15000 });
  const cam = page.getByRole("button", { name: "Turn on camera" });
  await expect(cam).toBeVisible({ timeout: 15000 });
  await cam.click();
  // Your own camera shows in your tile (mirrored) immediately.
  await expect(page.locator(".voice-tile-camera.mirrored").first()).toBeVisible({ timeout: 10000 });
}

test("a camera tile goes fullscreen", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("camfull");
  await createChannel(page, channel, "Voice channel");
  await joinVoiceAndEnableCamera(page, channel);

  const { context, page: member } = await newMemberPage(browser, uniqueName("CamMate"));
  try {
    await joinVoiceAndEnableCamera(member, channel);
    const remote = page.locator(".voice-tile.has-camera").filter({ has: page.locator(".voice-tile-camera:not(.mirrored)") }).first();
    await expect(remote).toBeVisible({ timeout: 30000 });
    await remote.hover();
    await remote.getByRole("button", { name: /^Fullscreen camera:/ }).click();
    await expect
      .poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains("voice-tile-camera") ?? false))
      .toBe(true);
  } finally {
    await context.close();
  }
});
