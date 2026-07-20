import { test, expect } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P26 — hub-streams panel: watch a screen share happening in another channel
// without joining it. Owner shares in channel A; a member sitting in a
// different channel discovers the share via the panel and watches it.

test("discover and watch a screen share from another channel", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  // A control channel the member will sit in, and channel A for the share.
  const other = uniqueName("lobby");
  const shareChan = uniqueName("stage");
  await createChannel(page, other);
  await createChannel(page, shareChan);

  // Owner joins voice in channel A and starts a screen share there. Share
  // screen lives in the voice-session footer — a channel row is joined by
  // double-click (see the "Double-click to join voice" row tooltip in
  // SortableItems.tsx), not a header button.
  await channelButton(page, shareChan).dblclick();
  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${shareChan}`, { timeout: 15000 });
  await page.getByRole("button", { name: "Share screen" }).click();
  await expect(page.locator(".screen-share-self-preview")).toBeVisible({ timeout: 20000 });

  const { context, page: member } = await newMemberPage(browser, uniqueName("Watcher"));
  try {
    // Member sits in the OTHER channel (not the one being shared in).
    await channelButton(member, other).click({ timeout: 15000 });

    // Open the hub-streams panel and watch the owner's share.
    await member.getByTitle("Live screen shares").first().click({ timeout: 15000 });
    const panel = member.getByRole("dialog", { name: "Live screen shares" });
    await expect(panel).toBeVisible({ timeout: 10000 });
    const watch = panel.getByRole("button", { name: "Watch" });
    await expect(watch.first()).toBeVisible({ timeout: 15000 });
    await watch.first().click();
    await panel.getByRole("button", { name: "Close" }).click(); // close so the viewer isn't obscured

    // The shared viewer renders the subscribed stream for the member.
    await expect(member.locator(".screen-share-panel").first()).toBeVisible({ timeout: 20000 });

    // Reopen the panel and stop watching → the viewer goes away.
    await member.getByTitle("Live screen shares").first().click({ timeout: 15000 });
    await panel.getByRole("button", { name: "Stop watching" }).first().click({ timeout: 15000 });
    await panel.getByRole("button", { name: "Close" }).click();
    await expect(member.locator(".screen-share-panel")).toHaveCount(0, { timeout: 15000 });
  } finally {
    await context.close();
  }
});
