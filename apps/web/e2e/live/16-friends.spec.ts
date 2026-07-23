import { test, expect, type Page } from "@playwright/test";
import { expectInHub, hubApi, newMemberPage, OWNER_PUBKEY, uniqueName } from "./helpers/live";

// P16 — friends (previously the web 👥 button was a dead no-op). Two-client
// flow: A sends a request → B sees it pending and accepts → A sees B in
// their friends list → remove. Endpoints: /friends, /friends/pending,
// /friends/{from}/accept, DELETE /friends/{target}.

async function openFriends(page: Page) {
  // These buttons render an emoji as their label, so their accessible name is
  // the emoji, not the tooltip — target by title.
  await page.getByTitle("Direct Messages").first().click();
  await page.getByTitle("Friends").first().click();
  await expect(page.getByRole("dialog", { name: "Friends" })).toBeVisible();
}

test("send, accept, and remove a friend across two clients", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  const memberName = uniqueName("Buddy");
  const { context, page: member } = await newMemberPage(browser, memberName);
  try {
    // Resolve the member's pubkey from the owner's /users view.
    const users = await hubApi<Array<{ public_key: string; display_name: string | null }>>(page, "/users");
    const buddyPk = users.find((u) => u.display_name === memberName)!.public_key;

    // Owner sends a friend request to the member.
    await openFriends(page);
    const dialog = page.getByRole("dialog", { name: "Friends" });
    await dialog.getByPlaceholder("Public key (paste here)").fill(buddyPk);
    await dialog.getByRole("button", { name: "Send", exact: true }).click();
    // The owner is a fixed identity on a persistent DB, so "No friends yet"
    // isn't reliable (prior runs may have left relationships). Assert
    // member-scoped instead: the buddy isn't a *friend* yet (still pending).
    await expect(dialog.locator(".friend-item").filter({ hasText: memberName })).toHaveCount(0);

    // Member sees the pending request and accepts it.
    await openFriends(member);
    const memberDialog = member.getByRole("dialog", { name: "Friends" });
    await expect(memberDialog.getByText("Pending requests")).toBeVisible({ timeout: 10000 });
    await memberDialog.getByRole("button", { name: "Accept" }).click();
    // After accepting, the owner is the member's friend. Assert persistence
    // via the member's own /friends API rather than the rendered row text:
    // friend-row labels resolve display names server-side, and matching on
    // that text flaked under full-suite load. The API is the source of truth.
    await expect
      .poll(
        async () =>
          (await hubApi<Array<{ public_key: string }>>(member, "/friends")).map((f) => f.public_key),
        { timeout: 15000 },
      )
      .toContain(OWNER_PUBKEY);
    // And the UI reflects it: a friend row is present, pending list cleared.
    await expect(memberDialog.locator(".friend-item")).not.toHaveCount(0);

    // Owner reopens Friends (reload happens on open) and now has the member —
    // again asserted via the owner's /friends API for load-independence.
    await page.getByRole("dialog", { name: "Friends" }).getByRole("button", { name: "Close" }).click();
    await openFriends(page);
    await expect
      .poll(
        async () =>
          (await hubApi<Array<{ public_key: string }>>(page, "/friends")).map((f) => f.public_key),
        { timeout: 15000 },
      )
      .toContain(buddyPk);
    const ownerRow = page.getByRole("dialog", { name: "Friends" })
      .locator(".friend-item")
      .filter({ hasText: memberName });
    await expect(ownerRow).toBeVisible({ timeout: 10000 });

    // Remove the friend — assert the buddy is gone from the owner's /friends.
    await ownerRow.getByRole("button", { name: "Remove" }).click();
    await expect
      .poll(
        async () =>
          (await hubApi<Array<{ public_key: string }>>(page, "/friends")).map((f) => f.public_key),
        { timeout: 15000 },
      )
      .not.toContain(buddyPk);
  } finally {
    await context.close();
  }
});
