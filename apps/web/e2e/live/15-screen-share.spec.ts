import { test, expect } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P15 — outbound screen share (web could previously only VIEW shares). The
// sharer captures via getDisplayMedia + MediaRecorder and relays chunks over
// the hub; a second client in the channel receives screen_share_started and
// renders the viewer panel. Runs on fake media (see playwright.config args).

test("start a screen share; a second client sees it, then stop", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("share");
  await createChannel(page, channel);
  await channelButton(page, channel).click();

  // A viewer joins the same channel.
  const { context, page: viewer } = await newMemberPage(browser, uniqueName("Viewer"));
  try {
    await channelButton(viewer, channel).click();

    // Owner starts sharing → their "You're sharing" bar appears.
    await page.getByRole("button", { name: "Share screen" }).click();
    await expect(page.locator(".screen-share-active-bar")).toBeVisible({ timeout: 20000 });

    // The viewer receives the stream and renders the screen-share panel.
    await expect(viewer.locator(".screen-share-panel")).toBeVisible({ timeout: 20000 });

    // Owner stops → their bar disappears and the viewer's panel goes away.
    await page.getByRole("button", { name: "Stop sharing" }).click();
    await expect(page.locator(".screen-share-active-bar")).toBeHidden({ timeout: 10000 });
    await expect(viewer.locator(".screen-share-panel")).toBeHidden({ timeout: 15000 });
  } finally {
    await context.close();
  }
});
