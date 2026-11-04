import { test, expect } from "@playwright/test";
import { expectInHub, hubApi, newMemberPage, uniqueName } from "./helpers/live";

// P75 — a file sent in a DM. The paperclip in a web DM used to do nothing
// (clients#235), and because no caller ever passed attachments to sendDm, the
// production bundle dropped the code that keeps the sender's own copy of an
// encrypted DM's files (clients#234): a ratchet cannot decrypt its own
// outbound envelopes, so after a reload the sender saw nothing. The reload
// below is the part only a built bundle could get wrong.

test("a DM attachment reaches the recipient and survives the sender's reload", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  const memberName = uniqueName("Filepal");
  const { context, page: member } = await newMemberPage(browser, memberName);
  try {
    await hubApi(page, "/channels", { method: "POST", body: { name: uniqueName("dmfiles") } });
    await page.reload();
    await expectInHub(page);

    const memberRow = page.locator("li.user-list-item", { hasText: memberName });
    await expect(memberRow).toBeVisible({ timeout: 10000 });
    await memberRow.click({ button: "right" });
    await page.locator(".context-menu").getByText("Direct message").click();

    const composer = page.getByPlaceholder("Write a message");
    await expect(composer).toBeVisible({ timeout: 10000 });
    const fileName = `${uniqueName("note")}.txt`;
    await page.locator(".input-area .btn-attach input[type=file]").setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from("attached in a DM"),
    });
    await expect(page.getByText(fileName).first()).toBeVisible();
    const text = `dm-file ${Date.now()}`;
    await composer.fill(text);
    await composer.press("Enter");
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 10000 });

    const owner = await hubApi<{ display_name: string | null }>(page, "/me");
    await member.getByTitle("Direct Messages").first().click();
    await member.locator("li.channel-item", { hasText: owner.display_name ?? "" }).click();
    await expect(member.getByText(text).first()).toBeVisible({ timeout: 10000 });
    await expect(member.getByText(fileName).first()).toBeVisible();

    await page.reload();
    await expectInHub(page);
    await page.getByTitle("Direct Messages").first().click();
    await page.locator("li.channel-item", { hasText: memberName }).click();
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(fileName).first()).toBeVisible();
  } finally {
    await context.close();
  }
});
