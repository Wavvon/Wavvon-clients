import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P64 — a screen share that anyone can actually see.
//
// P15 drives the same flow and stops where every media spec in this suite
// stopped before 2026-09-10: it asserts the viewer's `.screen-share-panel`
// renders. That panel renders from `screen_share_started` — state the hub
// pushes over the WebSocket — and the `<video>` inside it gets its source
// separately, so the panel appears whether or not a single chunk ever
// arrives, is appended to the SourceBuffer, or decodes. That is exactly the
// shape that hid two complete voice failures (shipped log, 2026-09-10): the
// roster was right, the transport looked right, and nobody heard anything.
//
// The assertion here is the decoded picture itself. `videoWidth` is 0 until a
// frame has been decoded — it is read off the frame, not off the element's
// attributes — and `currentTime` only advances while decoded media plays. A
// share that never crossed fails both.

async function joinVoice(page: Page, channel: string) {
  await channelButton(page, channel).dblclick();
  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${channel}`, {
    timeout: 15000,
  });
}

/** What the viewer's `<video>` has actually decoded. */
function decodedState(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLVideoElement>(".screen-share-panel video.main-stream");
    if (!el) return null;
    return {
      videoWidth: el.videoWidth,
      videoHeight: el.videoHeight,
      currentTime: el.currentTime,
      readyState: el.readyState,
      error: el.error?.message ?? null,
    };
  });
}

test("a screen share arrives as decoded frames, not just a panel", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("frames");
  await createChannel(page, channel);
  await joinVoice(page, channel);

  const { context, page: viewer } = await newMemberPage(browser, uniqueName("Viewer"));
  try {
    await joinVoice(viewer, channel);

    await page.getByRole("button", { name: "Share screen" }).click();
    await expect(page.locator(".screen-share-self-preview")).toBeVisible({ timeout: 20000 });
    await expect(viewer.locator(".screen-share-panel")).toBeVisible({ timeout: 20000 });

    // The sharer's own preview is a local MediaStream and proves nothing about
    // the relay — but it does separate "capture failed" from "delivery
    // failed", which is worth a line when this goes red.
    const selfDecoded = await page.evaluate(() => {
      const el = document.querySelector<HTMLVideoElement>(".screen-share-self-preview video");
      return el ? { videoWidth: el.videoWidth, currentTime: el.currentTime } : null;
    });
    expect(selfDecoded, "the sharer must be capturing something").not.toBeNull();

    // The claim: pixels crossed the hub and decoded on the other side. The
    // sharer's MediaRecorder emits on an interval, and MSE needs the init
    // segment plus a media segment before the first frame, so this is given
    // room.
    await expect
      .poll(async () => (await decodedState(viewer))?.videoWidth ?? 0, {
        timeout: 60000,
        message: "the viewer's video must decode a frame from the relayed stream",
      })
      .toBeGreaterThan(0);

    // And it keeps arriving rather than stopping at the first segment: a
    // paused clock means one decoded frame and then nothing.
    const first = await decodedState(viewer);
    await expect
      .poll(async () => (await decodedState(viewer))?.currentTime ?? 0, {
        timeout: 30000,
        message: `playback must advance past ${first?.currentTime}`,
      })
      .toBeGreaterThan((first?.currentTime ?? 0) + 0.1);
  } finally {
    await context.close();
  }
});
