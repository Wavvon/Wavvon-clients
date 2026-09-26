import { test, expect } from "@playwright/test";
import { expectInHub, hubApi, newMemberPage, uniqueName } from "./helpers/live";

// P57 — direct messages, two clients, all live (no reloads after setup):
// owner starts a DM from the member right-click menu and sends; the member's
// connected client sees the new conversation appear (dm_member_changed on
// create + live WS membership — both hub fixes 2026-07-26), reads the
// message, and replies; the owner sees their own send (reload-after-send,
// the hub never echoes to the sender) and the reply live (onDm arm).
// Pins the useDms hook extraction and both DM-liveness bugs it surfaced.

test("start a DM, exchange messages across two clients", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  const memberName = uniqueName("Penpal");
  const { context, page: member } = await newMemberPage(browser, memberName);
  try {
    // Make sure at least one channel exists — an owner on a zero-channel hub
    // gets the channel-template wizard overlay, which would block the page.
    await hubApi(page, "/channels", { method: "POST", body: { name: uniqueName("dmspec") } });

    // Owner reloads to pick up the new member in the user list.
    await page.reload();
    await expectInHub(page);

    const memberRow = page.locator("li.user-list-item", { hasText: memberName });
    await expect(memberRow).toBeVisible({ timeout: 10000 });
    await memberRow.click({ button: "right" });
    await page.locator(".context-menu").getByText("Direct message").click();

    // The DM view opens with the composer; send the first message.
    const composer = page.getByPlaceholder("Write a message");
    await expect(composer).toBeVisible({ timeout: 10000 });
    const msg1 = `dm-hello ${Date.now()}`;
    await composer.fill(msg1);
    await composer.press("Enter");
    await expect(page.getByText(msg1).first()).toBeVisible({ timeout: 10000 });

    // The member's connected client learns of the conversation live — no
    // reload. Open the DM sidebar and select it.
    //
    // The owner's name is read back from the hub rather than assumed to be
    // OWNER_NAME. These specs deliberately share one persistent hub in file
    // order, and P24 renames the owner without putting the name back, so the
    // seed constant is stale by the time this file runs. P48 already reads it
    // back for exactly this reason and says so in its own comment -- this spec
    // simply did not, and failed with "element(s) not found", which reads like
    // a DM-liveness bug and is not one.
    const owner = await hubApi<{ display_name: string | null }>(page, "/me");
    const ownerName = owner.display_name ?? "";
    expect(ownerName).not.toBe("");
    await member.getByTitle("Direct Messages").first().click();
    const convRow = member.locator("li.channel-item", { hasText: ownerName });
    await expect(convRow).toBeVisible({ timeout: 10000 });
    await convRow.click();
    await expect(member.getByText(msg1).first()).toBeVisible({ timeout: 10000 });

    // Member replies; the owner (conversation open) sees it live via onDm.
    const memberComposer = member.getByPlaceholder("Write a message");
    const msg2 = `dm-reply ${Date.now()}`;
    await memberComposer.fill(msg2);
    await memberComposer.press("Enter");
    await expect(page.getByText(msg2).first()).toBeVisible({ timeout: 15000 });
  } finally {
    await context.close();
  }
});
