import { test, expect } from "@playwright/test";
import { expectInHub, hubApi, newMemberPage, uniqueName } from "./helpers/live";

// P78 — group DMs end to end, three real clients on one hub. The owner turns
// a 1:1 into a group with "Add people", sends, and both members read it: only
// a message that went through the sender-key wrap and the ratchet decrypts,
// so the text appearing at all is the proof. The hub is asked what it stored
// and must hold no plaintext. A member replies, then leaves.

test("a group DM is created, read by every member, and left", async ({ page, browser }) => {
  test.setTimeout(150000);
  await page.goto("/");
  await expectInHub(page);

  const aliceName = uniqueName("GroupA");
  const bobName = uniqueName("GroupB");
  const alice = await newMemberPage(browser, aliceName);
  const bob = await newMemberPage(browser, bobName);
  try {
    await hubApi(page, "/channels", { method: "POST", body: { name: uniqueName("groupspec") } });
    await page.reload();
    await expectInHub(page);

    // A 1:1 with Alice first, then "Add people" brings Bob in as a new group.
    const aliceRow = page.locator("li.user-list-item", { hasText: aliceName });
    await expect(aliceRow).toBeVisible({ timeout: 10000 });
    await aliceRow.click({ button: "right" });
    await page.locator(".context-menu").getByText("Direct message").click();
    await expect(page.getByPlaceholder("Write a message")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Add people" }).click();
    const picker = page.getByRole("dialog", { name: "Add people to this conversation" });
    await picker.getByLabel(bobName).check();
    await picker.getByRole("button", { name: "Add 1 person" }).click();
    await expect(page.locator(".channel-header h3", { hasText: bobName })).toBeVisible({ timeout: 10000 });

    const composer = page.getByPlaceholder("Write a message");
    const msg1 = `group-hello ${Date.now()}`;
    await composer.fill(msg1);
    await composer.press("Enter");
    await expect(page.getByText(msg1).first()).toBeVisible({ timeout: 10000 });

    // What the hub holds: a sender-key envelope and no readable content.
    const convs = await hubApi<{ id: string; conv_type: string; members: string[] }[]>(page, "/conversations");
    const group = convs.find((c) => c.conv_type === "group" && c.members.length === 3);
    expect(group).toBeTruthy();
    const stored = await hubApi<{ content: string | null; group_encrypted_envelope?: unknown }[]>(
      page, `/conversations/${group!.id}/messages?limit=5`,
    );
    expect(stored.length).toBeGreaterThan(0);
    for (const m of stored) {
      expect(m.content ?? "").not.toContain("group-hello");
      expect(m.group_encrypted_envelope).toBeTruthy();
    }

    const ownerName = (await hubApi<{ display_name: string | null }>(page, "/me")).display_name ?? "";
    for (const member of [alice.page, bob.page]) {
      await member.getByTitle("Direct Messages").first().click();
      const row = member.locator("li.channel-item", { hasText: ownerName }).filter({ hasText: "," });
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await expect(member.getByText(msg1).first()).toBeVisible({ timeout: 15000 });
    }

    // A member's own sender key reaches the others too.
    const msg2 = `group-reply ${Date.now()}`;
    const bobComposer = bob.page.getByPlaceholder("Write a message");
    await bobComposer.fill(msg2);
    await bobComposer.press("Enter");
    await expect(page.getByText(msg2).first()).toBeVisible({ timeout: 15000 });
    await expect(alice.page.getByText(msg2).first()).toBeVisible({ timeout: 15000 });

    // Bob leaves; the owner's conversation drops him.
    await bob.page.getByRole("button", { name: "Leave group" }).click();
    await bob.page.getByRole("button", { name: "Leave", exact: true }).click();
    await expect.poll(async () => {
      const after = await hubApi<{ id: string; members: string[] }[]>(page, "/conversations");
      return after.find((c) => c.id === group!.id)?.members.length;
    }, { timeout: 15000 }).toBe(2);
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});
