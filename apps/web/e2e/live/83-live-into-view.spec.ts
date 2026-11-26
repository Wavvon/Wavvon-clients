import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P83 — opening a live brings it into view (#492).
//
// The opened live sits on the stage, under the room header and the live
// tray; on a short window it landed below the fold and the member had to
// scroll to find what they had just opened. The stage now scrolls into view.

async function joinVoice(page: Page, channel: string) {
  await channelButton(page, channel).dblclick();
  await expect(page.locator(".voice-status-room").first()).toHaveText(`${channel}`, {
    timeout: 15000,
  });
}

test("an opened live is in view without scrolling", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("inview");
  await createChannel(page, channel, "Voice channel");
  await joinVoice(page, channel);

  const { context, page: viewer } = await newMemberPage(browser, uniqueName("Viewer"));
  try {
    await viewer.setViewportSize({ width: 1280, height: 420 });
    await joinVoice(viewer, channel);
    await page.getByRole("button", { name: "Share screen" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Share", exact: true }).click();

    const chip = viewer.locator(".live-chip").first();
    await expect(chip).toBeVisible({ timeout: 20000 });
    await chip.click();
    await expect(viewer.locator(".screen-share-panel video.main-stream")).toBeAttached({ timeout: 20000 });

    await expect
      .poll(() => viewer.evaluate(() => {
        const r = document.querySelector(".screen-share-panel video.main-stream")!.getBoundingClientRect();
        return r.top >= 0 && r.top < window.innerHeight / 2;
      }), { timeout: 10000, message: "the live must start in the upper half of the window" })
      .toBe(true);
  } finally {
    await context.close();
  }
});
