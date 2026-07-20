import { test, expect, type Locator, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P49 — event staging panel (events.md §7.5): live moves (claimant already in
// voice, RSVP-consent auto-accept + rejoin toast) and queued assignments
// (claimant not in voice yet, applied on their next join).

async function openEventsTab(page: Page, channel: string) {
  await channelButton(page, channel).click();
  await page.getByRole("button", { name: "Events", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Upcoming events" })).toBeVisible();
}

// Web has no "Join Voice" header button (desktop-only) — a normal channel
// row is joined by double-click.
async function joinVoice(page: Page, channel: string) {
  await channelButton(page, channel).dblclick();
  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${channel}`, { timeout: 15000 });
}

function slotGroup(dialog: Locator, slotName: string) {
  return dialog.locator(".settings-section").filter({ hasText: slotName });
}

test("staging panel: live move (auto-accept + rejoin toast) and queued assignment", async ({ page, browser }) => {
  test.setTimeout(150000);
  await page.goto("/");
  await expectInHub(page);

  const anchor = uniqueName("raidp");
  const destA = uniqueName("squadaa");
  const destB = uniqueName("squadbb");
  await createChannel(page, anchor);
  await createChannel(page, destA);
  await createChannel(page, destB);

  await openEventsTab(page, anchor);
  await page.getByRole("button", { name: "+ Create event" }).click();
  const composer = page.getByRole("dialog", { name: "Create event" });
  await expect(composer).toBeVisible();
  const title = uniqueName("raid-event");
  await composer.getByPlaceholder("Event title").fill(title);
  await composer.locator("#event-start").fill("2030-01-01T18:00");
  await composer.getByRole("button", { name: "+ Add slot" }).click();
  await composer.getByPlaceholder("Slot name (e.g. Tank)").fill("Tank");
  await composer.getByRole("button", { name: "+ Add slot" }).click();
  await composer.getByPlaceholder("Slot name (e.g. Tank)").nth(1).fill("DPS");
  await composer.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(composer).not.toBeVisible();

  const card = page.locator(".event-card").filter({ hasText: title });
  await expect(card).toBeVisible();

  const bName = uniqueName("Tankclaim");
  const cName = uniqueName("Dpsclaim");
  const { context: bCtx, page: b } = await newMemberPage(browser, bName);
  const { context: cCtx, page: c } = await newMemberPage(browser, cName);
  try {
    // B claims Tank and joins voice on the anchor channel — the "live" path.
    await openEventsTab(b, anchor);
    const bCard = b.locator(".event-card").filter({ hasText: title });
    await bCard.getByRole("button", { name: "Claim", exact: true }).first().click();
    await expect(bCard.getByText("You")).toBeVisible();
    await joinVoice(b, anchor);

    // C claims DPS but stays out of voice — the "queued" path.
    await openEventsTab(c, anchor);
    const cCard = c.locator(".event-card").filter({ hasText: title });
    await cCard.getByRole("button", { name: "Claim", exact: true }).nth(1).click();
    await expect(cCard.getByText("You")).toBeVisible();

    // Owner opens Staging: B shows grouped under Tank, "in <anchor>".
    await card.getByRole("button", { name: "Staging", exact: true }).click();
    const staging = page.getByRole("dialog", { name: new RegExp(`^Staging: ${title}`) });
    await expect(staging).toBeVisible();
    const tankGroup = slotGroup(staging, "Tank");
    await expect(tankGroup).toContainText(bName);
    await expect(tankGroup).toContainText(`in ${anchor}`, { timeout: 15000 });

    // Move B to destA — B claimed the slot, so the hub auto-accepts and B's
    // client actually switches; a rejoin-escape-hatch toast appears.
    await tankGroup.getByRole("combobox", { name: "Move to…" }).selectOption({ label: destA });
    await tankGroup.getByRole("button", { name: "Move to…", exact: true }).click();
    await expect(b.locator(".voice-status-label").first()).toHaveText(`#${destA}`, { timeout: 15000 });
    await expect(b.getByText(`Moved to ${destA}`)).toBeVisible({ timeout: 15000 });
    await expect(b.getByRole("button", { name: "Rejoin previous channel?" })).toBeVisible();

    // The panel's own view (fed by the live voicePartByChannel prop) catches
    // up to reflect B now being in destA.
    await expect(tankGroup).toContainText(`in ${destA}`, { timeout: 15000 });

    // Assign C (not in voice) to destB — queued (events.md §7.3).
    const dpsGroup = slotGroup(staging, "DPS");
    await expect(dpsGroup).toContainText(cName);
    await dpsGroup.getByRole("combobox", { name: "Move to…" }).selectOption({ label: destB });
    await dpsGroup.getByRole("button", { name: "Move to…", exact: true }).click();
    await expect(dpsGroup).toContainText(`assigned`, { timeout: 15000 });
    await expect(dpsGroup).toContainText(`${destB}, not in voice yet`);

    // C joins any voice channel — the pending assignment auto-applies and
    // C lands in destB, not the channel they actually clicked join on.
    await joinVoiceExpectRedirect(c, anchor, destB);
  } finally {
    await bCtx.close();
    await cCtx.close();
  }
});

async function joinVoiceExpectRedirect(page: Page, joinedChannel: string, finalChannel: string) {
  await channelButton(page, joinedChannel).dblclick();
  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${finalChannel}`, { timeout: 20000 });
}
