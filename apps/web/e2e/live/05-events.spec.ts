import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P5 — event role-slot sign-ups + reminder picker (events.md §2–§3):
// composer slot editor, claim/unclaim on the card, capacity enforcement
// ("Full" for a second user once a 1-cap slot is taken).

async function openEventsTab(page: Page, channel: string) {
  await channelButton(page, channel).click();
  await page.getByRole("button", { name: "Events", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Upcoming events" })).toBeVisible();
}

test("event with slots: create, claim, capacity, unclaim", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("events");
  await createChannel(page, channel);
  await openEventsTab(page, channel);

  // Compose an event with a reminder and two slots (Tank cap 1, Healer ∞).
  await page.getByRole("button", { name: "+ Create event" }).click();
  const composer = page.getByRole("dialog", { name: "Create event" });
  await expect(composer).toBeVisible();
  const title = uniqueName("raid");
  await composer.getByPlaceholder("Event title").fill(title);
  await composer.locator("#event-start").fill("2026-07-10T18:00");
  await composer.locator("#event-reminder").selectOption({ label: "1 hour before" });
  await composer.getByRole("button", { name: "+ Add slot" }).click();
  await composer.getByPlaceholder("Slot name (e.g. Tank)").fill("Tank");
  await composer.getByPlaceholder("Capacity (blank = unlimited)").fill("1");
  await composer.getByRole("button", { name: "+ Add slot" }).click();
  await composer.getByPlaceholder("Slot name (e.g. Tank)").nth(1).fill("Healer");
  await composer.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(composer).not.toBeVisible();

  // Card renders with both slots empty. Scope to this event's card —
  // getEvents is hub-wide, so a persistent DB may hold other events.
  const card = page.locator(".event-card").filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card.getByText("0/1")).toBeVisible();
  await expect(card.getByText("0 signed up")).toBeVisible();

  // Owner claims Tank (first slot → first Claim button in this card).
  await card.getByRole("button", { name: "Claim", exact: true }).first().click();
  await expect(card.getByText("1/1")).toBeVisible();
  await expect(card.getByText("You")).toBeVisible();
  await expect(card.getByRole("button", { name: "Unclaim" })).toBeVisible();

  // A fresh member sees Tank as Full but can claim Healer.
  const { context, page: member } = await newMemberPage(browser, "Slot Member");
  try {
    await openEventsTab(member, channel);
    const memberCard = member.locator(".event-card").filter({ hasText: title });
    await expect(memberCard).toBeVisible();
    const fullBtn = memberCard.getByRole("button", { name: "Full" });
    await expect(fullBtn).toBeVisible();
    await expect(fullBtn).toBeDisabled();
    await memberCard.getByRole("button", { name: "Claim", exact: true }).click();
    await expect(memberCard.getByText("1 signed up")).toBeVisible();
    await expect(memberCard.getByRole("button", { name: "Unclaim" })).toBeVisible();
  } finally {
    await context.close();
  }

  // Owner unclaims Tank; the slot frees up.
  await card.getByRole("button", { name: "Unclaim" }).click();
  await expect(card.getByText("0/1")).toBeVisible();
});
