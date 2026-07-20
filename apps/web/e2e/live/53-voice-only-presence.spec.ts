import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P53 — voice-only presence (events.md §7.4): a member moved into a channel
// they can't read still gets voice — the hub's staging_voice_grants bypass
// on the /voice/ws read gate.
//
// The bare Phase-1 right-click "Move to channel…" primitive (no event_id)
// is a deliberate exception to this: hub's handle_voice_move rejects it
// outright ("Target cannot read the destination channel") rather than
// granting voice-only presence — a generic mod-tool move must not double as
// a channel-existence oracle. §7.4 is reachable only through an event-scoped
// move (the staging panel, §7.5), and every claimant/RSVP shown there
// already holds `status = 'going'`, so the hub always answers with
// `auto: true` (immediate switch + rejoin toast) — never the blocking
// accept/decline prompt P48 exercises for the event-less primitive.

async function openPermissionsTab(page: Page, channel: string) {
  const row = page.getByRole("button", { name: channel, exact: true });
  await row.hover();
  await row.getByRole("button", { name: "Channel settings" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Permissions", exact: true }).click();
  return dialog;
}

async function openEventsTab(page: Page, channel: string) {
  await channelButton(page, channel).click();
  await page.getByRole("button", { name: "Events", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Upcoming events" })).toBeVisible();
}

async function joinVoice(page: Page, channel: string) {
  await channelButton(page, channel).dblclick();
  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${channel}`, { timeout: 15000 });
}

function channelRow(page: Page, name: string) {
  return page.locator("li.channel-item-wrap").filter({ has: page.getByRole("button", { name: new RegExp(`^${name}(,| )|^${name}$`) }) });
}

function rosterEntry(page: Page, channelName: string, displayName: string) {
  return channelRow(page, channelName).locator(".channel-participant").filter({ hasText: displayName });
}

test("a member moved into a channel they can't read gets voice-only presence, never a sidebar/text reveal", async ({ page, browser }) => {
  test.setTimeout(150000);
  await page.goto("/");
  await expectInHub(page);

  const anchor = uniqueName("stagea");
  const hidden = uniqueName("stagehid");
  await createChannel(page, anchor);
  await createChannel(page, hidden);

  // Deny read_messages for @everyone on the destination — the member must
  // never see it in their sidebar, before or after the move.
  const permDialog = await openPermissionsTab(page, hidden);
  await permDialog.getByRole("button", { name: "everyone" }).click();
  const readRow = permDialog.locator(".settings-row").filter({ hasText: "Read messages" });
  await readRow.getByRole("button", { name: "Deny", exact: true }).click();
  await permDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(permDialog.getByRole("button", { name: "Saved" })).toBeVisible();
  await page.locator(".modal-overlay").click({ position: { x: 5, y: 5 } });
  await expect(permDialog).not.toBeVisible();

  await openEventsTab(page, anchor);
  await page.getByRole("button", { name: "+ Create event" }).click();
  const composer = page.getByRole("dialog", { name: "Create event" });
  await expect(composer).toBeVisible();
  const title = uniqueName("staging-event");
  await composer.getByPlaceholder("Event title").fill(title);
  await composer.locator("#event-start").fill("2030-01-01T18:00");
  await composer.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(composer).not.toBeVisible();

  const card = page.locator(".event-card").filter({ hasText: title });
  await expect(card).toBeVisible();

  const memberName = uniqueName("Staged");
  const { context, page: member } = await newMemberPage(browser, memberName);
  try {
    await expect(member.getByRole("button", { name: hidden, exact: true })).toHaveCount(0);

    // Member RSVPs "going" (no slots on this event — lands in the
    // synthesized "Unassigned" staging bucket, events.md §7.5) and joins
    // voice on the anchor — the "live move" path.
    await openEventsTab(member, anchor);
    const memberCard = member.locator(".event-card").filter({ hasText: title });
    await memberCard.getByRole("button", { name: "Going", exact: true }).click();
    await expect(memberCard.getByRole("button", { name: "Going", exact: true })).toHaveClass(/btn-primary/);
    await joinVoice(member, anchor);
    await expect(rosterEntry(page, anchor, memberName)).toBeVisible({ timeout: 15000 });

    // Owner opens Staging and moves the member into the hidden channel.
    await card.getByRole("button", { name: "Staging", exact: true }).click();
    const staging = page.getByRole("dialog", { name: new RegExp(`^Staging: ${title}`) });
    await expect(staging).toBeVisible();
    const unassignedGroup = staging.locator(".settings-section").filter({ hasText: "Unassigned" });
    await expect(unassignedGroup).toContainText(memberName);

    await unassignedGroup.getByRole("combobox", { name: "Move to…" }).selectOption({ label: hidden });
    await unassignedGroup.getByRole("button", { name: "Move to…", exact: true }).click();

    // RSVP'd "going" ⇒ the hub auto-accepts (events.md §7.2): the member's
    // client switches immediately, with the rejoin-escape-hatch toast — the
    // same live-move UX P49 exercises, but this time crossing into a channel
    // the member has no read access to (§7.4's voice-only presence).
    await expect(member.locator(".voice-status-label").first()).toHaveText(`#${hidden}`, { timeout: 15000 });
    await expect(member.getByText(`Moved to ${hidden}`)).toBeVisible({ timeout: 15000 });
    await expect(member.getByRole("button", { name: "Rejoin previous channel?" })).toBeVisible();

    // Voice HUD and the organizer's own roster both reveal the join...
    await expect(rosterEntry(page, hidden, memberName)).toBeVisible({ timeout: 15000 });

    // ...but the sidebar and text pane stay exactly as gated: no further
    // reveal beyond the voice session itself.
    await expect(member.getByRole("button", { name: hidden, exact: true })).toHaveCount(0);
    await expect(member.getByPlaceholder(`Message #${hidden}`)).toHaveCount(0);
  } finally {
    await context.close();
  }
});
