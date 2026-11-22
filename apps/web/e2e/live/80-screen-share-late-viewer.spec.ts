import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P80 — a live opened late still plays (Wavvon-clients#486).
//
// P64 opens the live a moment after it starts, so the viewer receives the
// recorder's byte stream from its first chunk on. A viewer who opens it later
// used to receive the first chunk and then slices from the middle of the
// stream, which cannot decode: one frame, then nothing. The hub now replays the
// header and the bytes since the newest keyframe, and the viewer jumps to them.
// Same assertions as P64, after a 20 s wait before opening the live.

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

test("a live opened 20 s after it started still plays", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("frames");
  await createChannel(page, channel, "Voice channel");
  await joinVoice(page, channel);

  const { context, page: viewer } = await newMemberPage(browser, uniqueName("Viewer"));
  try {
    await joinVoice(viewer, channel);

    await page.getByRole("button", { name: "Share screen" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Share", exact: true }).click();


    await expect(page.locator(".voice-self-share")).toBeVisible({ timeout: 20000 });
    // A live never opens by itself (#259): the viewer sees it in the tray
    // and opens it.
    const chip = viewer.locator(".live-chip").first();
    await expect(chip).toBeVisible({ timeout: 20000 });
    await viewer.waitForTimeout(20000);
    await expect(viewer.locator(".screen-share-panel")).toBeHidden();
    await chip.click();
    await expect(viewer.locator(".screen-share-panel")).toBeVisible({ timeout: 20000 });

    // The sharer's own preview is a local MediaStream and proves nothing about
    // the relay — but it does separate "capture failed" from "delivery
    // failed", which is worth a line when this goes red.
    const selfDecoded = await page.evaluate(() => {
      const el = document.querySelector<HTMLVideoElement>(".voice-self-share video");
      return el ? { videoWidth: el.videoWidth, currentTime: el.currentTime } : null;
    });
    expect(selfDecoded, "the sharer must be capturing something").not.toBeNull();

    // The claim: pixels crossed the hub and decoded on the other side. The
    // sharer's MediaRecorder emits on an interval, and MSE needs the init
    // segment plus a media segment before the first frame, so this is given
    // room.
    // When this goes red, say what the viewer had: buffered ranges, ready
    // state and any media error separate "nothing arrived" from "arrived and
    // did not decode".
    try {
      await expect
        .poll(async () => (await decodedState(viewer))?.videoWidth ?? 0, {
          timeout: 60000,
          message: "the viewer's video must decode a frame from the relayed stream",
        })
        .toBeGreaterThan(0);
    } catch (e) {
      const seen = await viewer.evaluate(() => {
        const el = document.querySelector<HTMLVideoElement>(".screen-share-panel video.main-stream");
        if (!el) return null;
        const ranges: string[] = [];
        for (let i = 0; i < el.buffered.length; i++) ranges.push(`${el.buffered.start(i).toFixed(2)}-${el.buffered.end(i).toFixed(2)}`);
        return { ranges, currentTime: el.currentTime, readyState: el.readyState, networkState: el.networkState, paused: el.paused, error: el.error?.message ?? null };
      });
      throw new Error(`${(e as Error).message}\nviewer: ${JSON.stringify(seen)}`, { cause: e });
    }

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
