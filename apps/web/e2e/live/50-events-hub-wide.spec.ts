import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P50 — hub-level events (events.md §5): a hub_wide event bypasses the
// anchor channel's read-gate in list_events, so a member who can't read the
// anchor still sees it in the events panel; a plain (non-hub_wide) event on
// the same restricted anchor stays invisible to them.

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

async function createEvent(
  page: Page,
  opts: { title: string; scope: "channel" | "hub_wide"; announcementChannel?: string },
) {
  await page.getByRole("button", { name: "+ Create event" }).click();
  const composer = page.getByRole("dialog", { name: "Create event" });
  await expect(composer).toBeVisible();
  await composer.getByPlaceholder("Event title").fill(opts.title);
  await composer.locator("#event-start").fill("2030-01-01T18:00");
  if (opts.scope === "hub_wide") {
    await composer.locator("#event-scope").selectOption({ label: "Whole hub" });
    if (opts.announcementChannel) {
      await composer.locator("#event-announcement-channel").selectOption({ label: opts.announcementChannel });
    }
  }
  await composer.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(composer).not.toBeVisible();
}

test("hub-wide event bypasses read-gating; a plain event on the same anchor stays hidden", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const control = uniqueName("open-ctl");
  const restricted = uniqueName("locked-anc");
  await createChannel(page, control);
  await createChannel(page, restricted);

  // Deny read_messages for @everyone on the restricted anchor.
  const dialog = await openPermissionsTab(page, restricted);
  await dialog.getByRole("button", { name: "everyone" }).click();
  const readRow = dialog.locator(".settings-row").filter({ hasText: "Read messages" });
  await readRow.getByRole("button", { name: "Deny", exact: true }).click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Saved" })).toBeVisible();
  await page.locator(".modal-overlay").click({ position: { x: 5, y: 5 } });
  await expect(dialog).not.toBeVisible();

  // Owner opens the restricted channel's Events tab and posts two events
  // anchored there: one hub-wide, one plain.
  await openEventsTab(page, restricted);
  const hubWideTitle = uniqueName("townhall");
  await createEvent(page, { title: hubWideTitle, scope: "hub_wide", announcementChannel: restricted });
  const plainTitle = uniqueName("private-raid");
  await createEvent(page, { title: plainTitle, scope: "channel" });

  const hubWideCard = page.locator(".event-card").filter({ hasText: hubWideTitle });
  await expect(hubWideCard).toBeVisible();
  await expect(hubWideCard.getByText("Hub-wide")).toBeVisible();

  // A plain member can't read the restricted channel — it's absent from
  // their sidebar — but the events panel is hub-wide, not channel-scoped, so
  // they can open it from any channel they DO have access to.
  const { context, page: member } = await newMemberPage(browser, uniqueName("Bystander"));
  try {
    await expect(member.getByRole("button", { name: restricted, exact: true })).toHaveCount(0);
    await openEventsTab(member, control);
    await expect(member.locator(".event-card").filter({ hasText: hubWideTitle })).toBeVisible({ timeout: 15000 });
    await expect(member.locator(".event-card").filter({ hasText: plainTitle })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
