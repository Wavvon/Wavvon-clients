import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P79 — the room map (proximity voice), two clients in one room. The owner
// turns the map on and stands somewhere; the member must see the owner's dot
// where it was put. That dot is drawn only from the hub's
// voice_position_updated, so it is the proof the position crossed the wire:
// web read the member under the wrong field name and never saw anyone's.

async function joinAndOpen(page: Page, channel: string) {
  await channelButton(page, channel).dblclick();
  await expect(page.locator(".voice-status-label").first()).toHaveText(`#${channel}`, { timeout: 15000 });
  await channelButton(page, channel).click();
}

test("the room map carries a position from one client to the other", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const room = uniqueName("mapr");
  await createChannel(page, room, "Voice channel");
  await joinAndOpen(page, room);

  const { context, page: member } = await newMemberPage(browser, uniqueName("Mapper"));
  try {
    await joinAndOpen(member, room);
    // Only a member with channels.manage may turn it on.
    await expect(member.getByRole("button", { name: "Turn on the room map" })).toHaveCount(0);

    await page.getByRole("button", { name: "Turn on the room map" }).click();
    const ownerMap = page.getByRole("application", { name: "Room map" });
    await expect(ownerMap).toBeVisible({ timeout: 15000 });
    const memberMap = member.getByRole("application", { name: "Room map" });
    await expect(memberMap).toBeVisible({ timeout: 15000 });

    // Stand in the top-left quarter.
    const box = (await ownerMap.boundingBox())!;
    await ownerMap.click({ position: { x: box.width * 0.2, y: box.height * 0.25 } });

    const dot = memberMap.locator(".voice-room-map-dot");
    await expect(dot).toHaveCount(1, { timeout: 15000 });
    const left = await dot.evaluate((el) => parseFloat((el as HTMLElement).style.left));
    const top = await dot.evaluate((el) => parseFloat((el as HTMLElement).style.top));
    expect(left).toBeGreaterThan(15);
    expect(left).toBeLessThan(25);
    expect(top).toBeGreaterThan(20);
    expect(top).toBeLessThan(30);

    // Off again, for everyone.
    await page.getByRole("button", { name: "Turn off the room map" }).click();
    await expect(memberMap).toHaveCount(0, { timeout: 15000 });
  } finally {
    await context.close();
  }
});
