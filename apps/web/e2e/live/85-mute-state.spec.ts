import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P85 — a muted member shows as muted in the room (#452).
//
// Self-mute used to be invisible to everyone else: the hub never heard of
// it. A client on a hub with voice.mute.state now reports it, and the other
// members see a muted icon on that tile; unmuting takes it away.

async function joinVoice(page: Page, channel: string) {
  await channelButton(page, channel).dblclick();
  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${channel}`, { timeout: 15000 });
}

test("a muted member shows as muted to the room", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("mutestate");
  await createChannel(page, channel, "Voice channel");
  await joinVoice(page, channel);

  const memberName = uniqueName("Muter");
  const { context, page: member } = await newMemberPage(browser, memberName);
  try {
    await joinVoice(member, channel);
    const tile = page.locator(".voice-tile").filter({ hasText: memberName }).first();
    await expect(tile).toBeVisible({ timeout: 15000 });
    await expect(tile.locator(".voice-self-state")).toHaveCount(0);

    await member.getByRole("button", { name: "Mute microphone", exact: true }).first().click();
    await expect(tile.locator(".voice-self-state")).toBeVisible({ timeout: 15000 });

    await member.getByRole("button", { name: "Unmute microphone", exact: true }).first().click();
    await expect(tile.locator(".voice-self-state")).toHaveCount(0, { timeout: 15000 });
  } finally {
    await context.close();
  }
});
