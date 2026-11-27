import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P88 — an open live keeps playing when the stage changes layout.
//
// Switching the stage to the free layout mounts the lives viewer again, and a
// new MediaSource without the stream's init segment decodes nothing: the live
// went black for good. The viewer now subscribes again on remount and the hub
// replays the init segment with the last keyframe.

async function joinVoice(page: Page, channel: string) {
  await channelButton(page, channel).dblclick();
  await expect(page.locator(".voice-status-room").first()).toHaveText(`${channel}`, { timeout: 15000 });
}

function decodedWidth(page: Page) {
  return page.evaluate(() => document.querySelector<HTMLVideoElement>(".screen-share-panel video.main-stream")?.videoWidth ?? 0);
}

test("an open live keeps decoding after the stage switches layout", async ({ page, browser }) => {
  test.setTimeout(150000);
  await page.goto("/");
  await expectInHub(page);
  const channel = uniqueName("relayout");
  await createChannel(page, channel, "Voice channel");
  await joinVoice(page, channel);

  const { context, page: viewer } = await newMemberPage(browser, uniqueName("Watcher"));
  try {
    await joinVoice(viewer, channel);
    await page.getByRole("button", { name: "Share screen" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Share", exact: true }).click();
    await expect(page.locator(".voice-self-share")).toBeVisible({ timeout: 20000 });

    await viewer.locator(".live-chip").first().click();
    await expect.poll(() => decodedWidth(viewer), { timeout: 60000 }).toBeGreaterThan(0);

    await viewer.getByRole("button", { name: "Free layout" }).click();
    await expect.poll(() => decodedWidth(viewer), {
      timeout: 30000,
      message: "the live must decode again in the free layout",
    }).toBeGreaterThan(0);
  } finally {
    await viewer.evaluate(() => localStorage.removeItem("wavvon:voice-stage-free")).catch(() => {});
    await context.close();
  }
});
