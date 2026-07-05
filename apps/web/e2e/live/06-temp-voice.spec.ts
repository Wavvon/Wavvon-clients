import { test, expect } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P6 — join-to-create temp voice channels on web (regression for hub
// 1fc5aa6). Clicking a spawner ("Room Creator") over web's /voice/ws relay
// must spawn a personal temp room and land the user THERE, not in the
// spawner row itself. No audio assertions — fake media, UI state only.

test("clicking a spawner creates and joins a temp room, not the spawner", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  const spawner = uniqueName("lobby");
  await createChannel(page, spawner, "Room Creator");

  // Click the spawner → voice join → hub spawns a sibling temp room.
  await channelButton(page, spawner).click();

  // A temporary room appears and is the room we actually joined. Filter on
  // the in-voice marker so leftover (empty, not-yet-reaped) temp rooms from
  // sibling tests can't make the locator ambiguous.
  const tempRow = page
    .locator("li", { has: page.locator(".channel-temp-badge") })
    .filter({ has: page.locator(".in-voice-here") });
  await expect(tempRow).toBeVisible({ timeout: 20000 });

  // The spawner row itself must NOT be the active voice channel.
  const spawnerRow = page.locator("li", {
    has: page.getByRole("button", { name: new RegExp(`^${spawner}`) }),
  });
  await expect(spawnerRow.locator(".in-voice-here")).toHaveCount(0);

  // The voice session closes when the context tears down at test end; the
  // hub then reaps the now-empty temp room.
});

test("a non-admin owner can rename their temp room from the context menu", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const spawner = uniqueName("lobby");
  await createChannel(page, spawner, "Room Creator");

  // A plain member (no admin) joins the spawner and owns the spawned room.
  // Unique display name → unique room name ("<name>'s room"), so leftover
  // temp rooms from sibling tests can't collide with the locator.
  const memberName = uniqueName("owner");
  const { context, page: member } = await newMemberPage(browser, memberName);
  try {
    await channelButton(member, spawner).click();
    const tempRow = member.locator("li", {
      has: member.getByRole("button", { name: new RegExp(`^${memberName}'s room`) }),
    });
    await expect(tempRow).toBeVisible({ timeout: 20000 });
    await expect(tempRow.locator(".in-voice-here")).toBeVisible();

    // Right-click the temp room → owner-only "Rename room".
    await tempRow.getByRole("button").first().click({ button: "right" });
    const ctxMenu = member.locator(".context-menu");
    await expect(ctxMenu).toBeVisible();
    await ctxMenu.getByRole("button", { name: "Rename room" }).click();

    const dialog = member.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const newName = uniqueName("my-den");
    await dialog.getByRole("textbox").fill(newName);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();

    // The sidebar shows the renamed room (owner's view and admin's view).
    await expect(member.getByRole("button", { name: new RegExp(`^${newName}`) })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: new RegExp(`^${newName}`) })).toBeVisible({ timeout: 10000 });
  } finally {
    await context.close();
  }
});
