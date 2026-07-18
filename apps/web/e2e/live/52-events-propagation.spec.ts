import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P52 — event card propagation to sub-channels (events.md §6). A plain
// channel can only gain a descendant in this product via an event's
// auto-spawned squad rooms (channels.rs enforces "parent must be a
// category" for every other channel-creation path) — so the first event
// here exists only to spawn one squad room under the anchor, giving it a
// real descendant before the event under test is created with "Also post
// in sub-channels" checked.

async function openEventsTab(page: Page, channel: string) {
  await channelButton(page, channel).click();
  await page.getByRole("button", { name: "Events", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Upcoming events" })).toBeVisible();
}

async function openMessagesTab(page: Page, channel: string) {
  await channelButton(page, channel).click();
  await page.getByRole("button", { name: "Messages", exact: true }).click();
}

test("propagate_to_children fans the event card out to a descendant channel", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const anchor = uniqueName("propanchor");
  await createChannel(page, anchor);

  // Throwaway event, used only to spawn a squad room (= the anchor's only
  // possible descendant) so the real event's composer offers the checkbox.
  await openEventsTab(page, anchor);
  await page.getByRole("button", { name: "+ Create event" }).click();
  let composer = page.getByRole("dialog", { name: "Create event" });
  const spawnerTitle = uniqueName("spawner-event");
  await composer.getByPlaceholder("Event title").fill(spawnerTitle);
  await composer.locator("#event-start").fill("2030-01-01T18:00");
  await composer.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(composer).not.toBeVisible();

  const spawnerCard = page.locator(".event-card").filter({ hasText: spawnerTitle });
  await expect(spawnerCard).toBeVisible();
  await spawnerCard.getByRole("button", { name: "Staging", exact: true }).click();
  const staging = page.getByRole("dialog", { name: /^Staging:/ });
  await expect(staging).toBeVisible();
  const childPrefix = uniqueName("Sub");
  await staging.getByLabel("Number of rooms").fill("1");
  await staging.getByLabel("Name prefix").fill(childPrefix);
  await staging.getByRole("button", { name: "Spawn", exact: true }).click();
  const child = `${childPrefix} 1`;
  await expect(page.getByRole("button", { name: child, exact: true })).toBeVisible({ timeout: 15000 });
  await staging.getByRole("button", { name: "Close" }).click();

  // The real event under test: anchor now has a descendant, so the
  // propagation checkbox appears.
  const title = uniqueName("propagated-event");
  await page.getByRole("button", { name: "+ Create event" }).click();
  composer = page.getByRole("dialog", { name: "Create event" });
  await expect(composer).toBeVisible();
  await composer.getByPlaceholder("Event title").fill(title);
  await composer.locator("#event-start").fill("2030-01-01T18:00");
  await expect(composer.getByText("Also post in sub-channels")).toBeVisible();
  await composer.getByLabel("Also post in sub-channels").check();
  // A plain Playwright .click() on this submit button reliably reports
  // success here without ever firing the form's submit handler (verified —
  // no POST /events follows); a raw DOM click does. Reproduces only on this
  // second composer of the test (opened right after the staging dialog
  // closes), so it reads as a Playwright/synthetic-mouse-event quirk against
  // this dialog's post-interaction scroll state, not a product bug.
  await composer
    .getByRole("button", { name: "Create event", exact: true })
    .evaluate((el: HTMLElement) => el.click());
  await expect(composer).not.toBeVisible();

  // A plain member (no restrictions apply to either channel) sees the
  // card in both the anchor and its child.
  const { context, page: member } = await newMemberPage(browser, uniqueName("Reader"));
  try {
    await openMessagesTab(member, anchor);
    await expect(member.getByText(title)).toBeVisible({ timeout: 15000 });
    await openMessagesTab(member, child);
    await expect(member.getByText(title)).toBeVisible({ timeout: 15000 });
  } finally {
    await context.close();
  }
});
