import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P15 — outbound screen share (web could previously only VIEW shares). The
// sharer captures via getDisplayMedia + MediaRecorder and relays chunks over
// the hub; a second client in the channel receives screen_share_started and
// renders the viewer panel. Runs on fake media (see playwright.config args).

// Share screen lives in the voice-session footer — a channel row is joined
// by double-click (see the "Double-click to join voice" row tooltip in
// SortableItems.tsx), not a header button.
async function joinVoice(page: Page, channel: string) {
  await channelButton(page, channel).dblclick();
  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${channel}`, { timeout: 15000 });
}

test("start a screen share; a second client sees it, then stop", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("share");
  await createChannel(page, channel);
  await joinVoice(page, channel);

  // A viewer joins the same voice channel.
  const { context, page: viewer } = await newMemberPage(browser, uniqueName("Viewer"));
  try {
    await joinVoice(viewer, channel);

    // Owner starts sharing → their "You're sharing" self-preview appears.
    await page.getByRole("button", { name: "Share screen" }).click();
    await expect(page.locator(".screen-share-self-preview")).toBeVisible({ timeout: 20000 });

    // The viewer receives the stream and renders the screen-share panel.
    await expect(viewer.locator(".screen-share-panel")).toBeVisible({ timeout: 20000 });

    // Owner stops → their preview disappears and the viewer's panel goes away.
    // Two controls both accessible-name "Stop sharing" once active (the
    // footer toggle and the self-preview's own stop button) — use the
    // preview's, since that's the one under test here.
    await page.locator(".screen-share-self-preview").getByRole("button", { name: "Stop sharing" }).click();
    await expect(page.locator(".screen-share-self-preview")).toBeHidden({ timeout: 10000 });
    await expect(viewer.locator(".screen-share-panel")).toBeHidden({ timeout: 15000 });
  } finally {
    await context.close();
  }
});
