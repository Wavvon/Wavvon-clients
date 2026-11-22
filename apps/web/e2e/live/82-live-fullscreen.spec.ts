import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P82 — a live in fullscreen fills the screen (#491).
//
// The live's wrapper and video carry in-page height caps (60vh), and they
// used to hold in fullscreen too: the video stayed the size it had in the
// page, centred in black. In fullscreen the video must reach the full width
// or the full height of the screen (it keeps its aspect ratio).

async function joinVoice(page: Page, channel: string) {
  await channelButton(page, channel).dblclick();
  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${channel}`, {
    timeout: 15000,
  });
}

test("a live in fullscreen fills the screen", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("fullscreen");
  await createChannel(page, channel, "Voice channel");
  await joinVoice(page, channel);

  const { context, page: viewer } = await newMemberPage(browser, uniqueName("Viewer"));
  try {
    await joinVoice(viewer, channel);
    await page.getByRole("button", { name: "Share screen" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Share", exact: true }).click();

    const chip = viewer.locator(".live-chip").first();
    await expect(chip).toBeVisible({ timeout: 20000 });
    await chip.click();
    const wrap = viewer.locator(".screen-share-main-wrap").first();
    await expect(wrap).toBeVisible({ timeout: 20000 });
    await expect
      .poll(() => viewer.evaluate(() => document.querySelector<HTMLVideoElement>(".screen-share-panel video.main-stream")?.videoWidth ?? 0), { timeout: 60000 })
      .toBeGreaterThan(0);

    await wrap.hover();
    await wrap.getByRole("button", { name: "Fullscreen" }).click();
    await expect.poll(() => viewer.evaluate(() => !!document.fullscreenElement)).toBe(true);

    const fill = await viewer.evaluate(() => {
      // The picture as drawn: the element box, letterboxed to the video's own
      // aspect ratio, which is what object-fit: contain does.
      const el = document.querySelector<HTMLVideoElement>(".screen-share-panel video.main-stream")!;
      const r = el.getBoundingClientRect();
      const aspect = el.videoWidth / el.videoHeight;
      const w = Math.min(r.width, r.height * aspect);
      const h = Math.min(r.height, r.width / aspect);
      return { w: w / window.innerWidth, h: h / window.innerHeight };
    });
    expect(Math.max(fill.w, fill.h), JSON.stringify(fill)).toBeGreaterThan(0.95);
  } finally {
    await context.close();
  }
});
