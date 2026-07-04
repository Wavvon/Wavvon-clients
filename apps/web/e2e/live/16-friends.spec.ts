import { test, expect, type Page } from "@playwright/test";
import { expectInHub, hubApi, newMemberPage, uniqueName } from "./helpers/live";

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
    await dialog.getByPlaceholder("64-character public key").fill(buddyPk);
    await dialog.getByRole("button", { name: "Send request" }).click();
    await expect(dialog.getByText("No friends yet.")).toBeVisible();

    // Member sees the pending request and accepts it.
    await openFriends(member);
    const memberDialog = member.getByRole("dialog", { name: "Friends" });
    await expect(memberDialog.getByText("Pending requests")).toBeVisible({ timeout: 10000 });
    await memberDialog.getByRole("button", { name: "Accept" }).click();
    // After accepting, the owner appears in the member's friends list.
    await expect(memberDialog.getByText("Your friends")).toBeVisible();

    // Owner reopens Friends (reload happens on open) and now sees the member.
    await page.getByRole("dialog", { name: "Friends" }).getByRole("button", { name: "Close" }).click();
    await openFriends(page);
    const ownerRow = page.getByRole("dialog", { name: "Friends" })
      .locator(".settings-row")
      .filter({ hasText: memberName });
    await expect(ownerRow).toBeVisible({ timeout: 10000 });

    // Remove the friend.
    await ownerRow.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("dialog", { name: "Friends" }).getByText("No friends yet.")).toBeVisible({ timeout: 10000 });
  } finally {
    await context.close();
  }
});
