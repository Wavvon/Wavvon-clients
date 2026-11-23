import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P86 — the room pops out into a picture-in-picture window (#495).
//
// One Document Picture-in-Picture window, opened only from the room bar,
// holds a copy of the room: with no stage, everyone in the call, cameras as
// video and everyone else as their avatar. The window is a separate document;
// the claim is about what it shows.

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

test("the room pops out with everyone in it", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);
  test.skip(!(await page.evaluate(() => "documentPictureInPicture" in window)), "no Document Picture-in-Picture in this browser");

  const channel = uniqueName("popout");
  await createChannel(page, channel, "Voice channel");
  await joinVoiceAndEnableCamera(page, channel);

  const memberName = uniqueName("Popped");
  const { context, page: member } = await newMemberPage(browser, memberName);
  try {
    await channelButton(member, channel).dblclick();
    await expect(page.locator(".voice-tile").filter({ hasText: memberName }).first()).toBeVisible({ timeout: 15000 });

    const [pip] = await Promise.all([
      page.context().waitForEvent("page"),
      page.getByRole("button", { name: "Pop the room out" }).click(),
    ]);
    await expect(pip.locator(".room-pip .voice-tile")).toHaveCount(2, { timeout: 10000 });
    await expect(pip.locator(".room-pip .voice-tile-camera")).toHaveCount(1);
    await expect(pip.locator(".room-pip .voice-tile").filter({ hasText: memberName })).toBeVisible();
  } finally {
    await context.close();
  }
});
