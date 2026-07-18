import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P48 — voice-move Phase 1 primitive (events.md §7.1/§7.2): right-click a
// voice participant, "Move to channel…", target with no event context always
// gets the accept/decline prompt (never auto-accepted). Also verifies the
// menu entry itself is gated on move_members.

// The "Move to channel…" hover submenu opens anchored to the trigger's own
// top (HoverSubmenu only flips horizontally, not vertically), so on a hub
// with many voice channels (the shared wavvon_e2e DB accumulates them across
// the whole live suite) it can render mostly below the fold if the
// right-click happens low in a long, scrolled sidebar. A tall viewport keeps
// this test's own destination-picker reachable regardless of how many
// channels precede it in the run — not a workaround for a real user's
// screen, just headroom for this suite's shared, ever-growing test hub.
test.use({ viewport: { width: 1280, height: 2000 } });

function channelRow(page: Page, name: string) {
  return page.locator("li.channel-item-wrap").filter({ has: page.getByRole("button", { name: new RegExp(`^${name}(,| )|^${name}$`) }) });
}

function rosterEntry(page: Page, channelName: string, displayName: string) {
  return channelRow(page, channelName).locator(".channel-participant").filter({ hasText: displayName });
}

// Web has no "Join Voice" header button (that's desktop-only, voice.join.header
// i18n key) — a normal channel row is joined by double-click (see the
// "Double-click to join voice" row tooltip in SortableItems.tsx).
async function joinVoice(page: Page, channel: string) {
  await channelButton(page, channel).dblclick();
  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${channel}`, { timeout: 15000 });
}

test("owner moves a member via right-click; prompt accept/decline both work", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const a = uniqueName("mova");
  const b = uniqueName("movb");
  await createChannel(page, a);
  await createChannel(page, b);

  await joinVoice(page, a);

  const memberName = uniqueName("Movee");
  const { context, page: member } = await newMemberPage(browser, memberName);
  try {
    await joinVoice(member, a);
    await expect(rosterEntry(page, a, memberName)).toBeVisible({ timeout: 15000 });

    // Owner right-clicks the member's roster row in channel A → "Move to
    // channel…" → picks B. No event context ⇒ always a blocking prompt
    // (events.md §7.2), never auto-accepted.
    await rosterEntry(page, a, memberName).click({ button: "right" });
    const ctxMenu = page.locator(".context-menu");
    await expect(ctxMenu).toBeVisible();
    await ctxMenu.getByRole("button", { name: /Move to channel/ }).hover();
    await ctxMenu.getByRole("button", { name: b, exact: true }).click();

    // Decline: nothing changes on either side.
    const prompt = member.getByRole("dialog", { name: "Move to another channel?" });
    await expect(prompt).toBeVisible({ timeout: 15000 });
    await expect(prompt).toContainText(b);
    await prompt.getByRole("button", { name: "Decline" }).click();
    await expect(prompt).not.toBeVisible();
    await member.waitForTimeout(1000);
    await expect(member.locator(".voice-status-label").first()).toHaveText(`#${a}`);
    await expect(rosterEntry(page, b, memberName)).toHaveCount(0);
    await expect(rosterEntry(page, a, memberName)).toBeVisible();

    // Accept: the member's client actually switches — both rosters update.
    await rosterEntry(page, a, memberName).click({ button: "right" });
    await expect(ctxMenu).toBeVisible();
    await ctxMenu.getByRole("button", { name: /Move to channel/ }).hover();
    await ctxMenu.getByRole("button", { name: b, exact: true }).click();
    const prompt2 = member.getByRole("dialog", { name: "Move to another channel?" });
    await expect(prompt2).toBeVisible({ timeout: 15000 });
    await prompt2.getByRole("button", { name: "Accept" }).click();
    await expect(member.locator(".voice-status-label").first()).toHaveText(`#${b}`, { timeout: 15000 });
    await expect(rosterEntry(page, b, memberName)).toBeVisible({ timeout: 15000 });
    await expect(rosterEntry(page, a, memberName)).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("a member without move_members has no 'Move to channel…' entry", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  const a = uniqueName("movc");
  await createChannel(page, a);
  await joinVoice(page, a);

  const moverName = uniqueName("Plain");
  const { context, page: mover } = await newMemberPage(browser, moverName);
  try {
    await joinVoice(mover, a);
    await expect(rosterEntry(page, a, moverName)).toBeVisible({ timeout: 15000 });

    // The plain member (no move_members, no admin) right-clicks the owner's
    // own roster row. The participant row itself has no context-menu handler
    // when onParticipantContextMenu is ungated-off, so the event bubbles to
    // the channel row's own (unrelated) context menu — assert the "Move to
    // channel…" entry specifically isn't there, not that no menu renders.
    await rosterEntry(mover, a, "Owner E2E").click({ button: "right" });
    await mover.waitForTimeout(500);
    await expect(mover.getByRole("button", { name: /Move to channel/ })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
