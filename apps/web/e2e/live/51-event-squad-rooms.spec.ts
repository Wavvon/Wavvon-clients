import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P51 — auto-spawned squad rooms (events.md §7.5 Phase 3): the staging
// panel can spawn N linked rooms under the event's anchor channel; they
// show up in the sidebar as the anchor's children and are listed first in
// the panel's move-destination picker, and moving a claimant into one works
// like any other voice-move destination.

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

test("staging panel spawns squad rooms; they're move destinations listed first", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const anchor = uniqueName("raidsq");
  await createChannel(page, anchor);

  await openEventsTab(page, anchor);
  await page.getByRole("button", { name: "+ Create event" }).click();
  const composer = page.getByRole("dialog", { name: "Create event" });
  await expect(composer).toBeVisible();
  const title = uniqueName("squad-event");
  await composer.getByPlaceholder("Event title").fill(title);
  await composer.locator("#event-start").fill("2030-01-01T18:00");
  await composer.getByRole("button", { name: "+ Add slot" }).click();
  await composer.getByPlaceholder("Slot name (e.g. Tank)").fill("Raider");
  await composer.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(composer).not.toBeVisible();

  const card = page.locator(".event-card").filter({ hasText: title });
  await expect(card).toBeVisible();

  const claimantName = uniqueName("Raider");
  const { context, page: claimant } = await newMemberPage(browser, claimantName);
  try {
    await openEventsTab(claimant, anchor);
    const claimantCard = claimant.locator(".event-card").filter({ hasText: title });
    await claimantCard.getByRole("button", { name: "Claim", exact: true }).click();
    await expect(claimantCard.getByText("You")).toBeVisible();
    await joinVoice(claimant, anchor);

    await card.getByRole("button", { name: "Staging", exact: true }).click();
    const staging = page.getByRole("dialog", { name: new RegExp(`^Staging: ${title}`) });
    await expect(staging).toBeVisible();

    const prefix = uniqueName("Raid");
    await staging.getByLabel("Number of rooms").fill("2");
    await staging.getByLabel("Name prefix").fill(prefix);
    await staging.getByRole("button", { name: "Spawn", exact: true }).click();
    await expect(staging.getByText("Spawning…")).toHaveCount(0, { timeout: 15000 });

    // The rooms appear in the sidebar, nested under the anchor.
    const room1 = `${prefix} 1`;
    const room2 = `${prefix} 2`;
    await expect(page.getByRole("button", { name: room1, exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: room2, exact: true })).toBeVisible();

    const raiderGroup = staging.locator(".settings-section").filter({ hasText: "Raider" });
    const destSelect = raiderGroup.getByRole("combobox", { name: "Move to…" });
    // orderDestinationsForEvent puts the event's own rooms first, relative
    // order otherwise preserved — assert set membership, not spawn order.
    const optionLabels = await destSelect.locator("option").allTextContents();
    expect(new Set(optionLabels.slice(0, 2))).toEqual(new Set([room1, room2]));

    await destSelect.selectOption({ label: room1 });
    await raiderGroup.getByRole("button", { name: "Move to…", exact: true }).click();
    await expect(claimant.locator(".voice-status-label").first()).toHaveText(`#${room1}`, { timeout: 15000 });
  } finally {
    await context.close();
  }
});
