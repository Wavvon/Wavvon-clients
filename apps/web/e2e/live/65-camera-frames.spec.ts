import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P65 — a camera anyone can actually see, the WebRTC half of P64's claim.
//
// P20 drives two cameras and asserts a tile that is not the local "You" tile
// appears on each side. That tile appears when the peer *track* arrives, and a
// track can be negotiated, attached and produce no picture at all — ICE up and
// no media, or a decode that fails silently. Same shape as the panel in P64
// and as the roster rows that hid two complete voice failures on 2026-09-10.
//
// `videoWidth` is read off a decoded frame, so it is 0 until one exists, and
// `currentTime` only advances while decoded media plays.
//
// Web renders camera tiles only in the floating PiP window (`VideoPipWindow`),
// which is why the tiles are looked up by class rather than inside a grid.

async function joinVoiceAndEnableCamera(page: Page, channel: string) {
  await channelButton(page, channel).dblclick();
  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${channel}`, {
    timeout: 15000,
  });
  const cam = page.getByRole("button", { name: "Turn on camera" });
  await expect(cam).toBeVisible({ timeout: 15000 });
  await cam.click();
  await expect(page.locator(".video-tile").filter({ hasText: "You" }).first()).toBeVisible({
    timeout: 10000,
  });
}

/** The `<video>` inside the first tile that is not our own preview. */
function remoteVideo(page: Page) {
  return page.locator(".video-tile").filter({ hasNotText: "You" }).first().locator("video");
}

function decoded(page: Page) {
  return remoteVideo(page).evaluate((el: HTMLVideoElement) => ({
    videoWidth: el.videoWidth,
    currentTime: el.currentTime,
    readyState: el.readyState,
  }));
}

test("a remote camera decodes frames, not just a tile", async ({ page, browser }) => {
  test.setTimeout(150000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("camframes");
  await createChannel(page, channel);
  await joinVoiceAndEnableCamera(page, channel);

  const { context, page: member } = await newMemberPage(browser, uniqueName("CamMate"));
  try {
    await joinVoiceAndEnableCamera(member, channel);

    await expect(remoteVideo(page)).toBeVisible({ timeout: 30000 });
    await expect(remoteVideo(member)).toBeVisible({ timeout: 30000 });

    // Both directions: a mesh that only carries one way is a real failure and
    // asserting one side would let it through.
    for (const [name, side] of [["owner", page], ["member", member]] as const) {
      await expect
        .poll(async () => (await decoded(side)).videoWidth, {
          timeout: 60000,
          message: `${name} must decode a frame from the peer's camera`,
        })
        .toBeGreaterThan(0);
    }

    const before = await decoded(page);
    await expect
      .poll(async () => (await decoded(page)).currentTime, {
        timeout: 30000,
        message: `playback must advance past ${before.currentTime}`,
      })
      .toBeGreaterThan(before.currentTime + 0.1);
  } finally {
    await context.close();
  }
});
