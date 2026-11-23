import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P87 — free layout on the stage, mirrored by the pop-out (#496).
//
// A member switches the stage to free layout and drags a pinned camera
// somewhere else: the tile moves and stays there, and the picture-in-picture
// window shows the stage in that layout rather than as a grid.

async function joinVoiceAndEnableCamera(page: Page, channel: string) {
  // Share screen and camera both live in the voice-session footer — a
  // channel row is joined by double-click (see the "Double-click to join
  // voice" row tooltip in SortableItems.tsx), not a header button.
  await channelButton(page, channel).dblclick();
  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${channel}`, { timeout: 15000 });
  const cam = page.getByRole("button", { name: "Turn on camera" });
  await expect(cam).toBeVisible({ timeout: 15000 });
  await cam.click();
  // Your own camera shows in your tile (mirrored) immediately.
  await expect(page.locator(".voice-tile-camera.mirrored").first()).toBeVisible({ timeout: 10000 });
}

test("a stage tile moves in free layout and the pop-out mirrors it", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("free");
  await createChannel(page, channel, "Voice channel");
  await joinVoiceAndEnableCamera(page, channel);

  const memberName = uniqueName("Freed");
  const { context, page: member } = await newMemberPage(browser, memberName);
  try {
    await joinVoiceAndEnableCamera(member, channel);
    const tile = page.locator(".voice-tile").filter({ hasText: memberName }).first();
    await expect(tile).toBeVisible({ timeout: 30000 });
    await tile.hover();
    await tile.getByRole("button", { name: new RegExp(`^Pin `) }).click();

    await page.getByRole("button", { name: "Free layout" }).click();
    const item = page.locator(".free-item").first();
    await expect(item).toBeVisible();
    const before = await item.boundingBox();
    await page.mouse.move(before!.x + 20, before!.y + 20);
    await page.mouse.down();
    await page.mouse.move(before!.x + 220, before!.y + 60, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await item.boundingBox())!.x).toBeGreaterThan(before!.x + 100);

    if (await page.evaluate(() => "documentPictureInPicture" in window)) {
      const [pip] = await Promise.all([
        page.context().waitForEvent("page"),
        page.getByRole("button", { name: "Pop the room out" }).click(),
      ]);
      await expect(pip.locator(".room-pip--free .free-item")).toHaveCount(1, { timeout: 10000 });
    }
  } finally {
    await page.evaluate(() => localStorage.removeItem("wavvon:voice-stage-free"));
    await context.close();
  }
});
