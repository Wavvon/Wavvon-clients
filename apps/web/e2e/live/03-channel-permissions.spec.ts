import { test, expect, type Page } from "@playwright/test";
import { createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P3 — channel permission overwrites (Permissions tab in channel settings).
// Owner denies send_messages for @everyone on one channel; a fresh member
// identity must be blocked there but able to post in a control channel.

async function openPermissionsTab(page: Page, channel: string) {
  const row = page.getByRole("button", { name: channel, exact: true });
  await row.hover();
  await row.getByRole("button", { name: "Channel settings" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Permissions", exact: true }).click();
  return dialog;
}

test("deny send_messages overwrite blocks a plain member", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const restricted = uniqueName("locked");
  const control = uniqueName("open");
  await createChannel(page, restricted);
  await createChannel(page, control);

  // Owner: deny send_messages for @everyone on the restricted channel.
  const dialog = await openPermissionsTab(page, restricted);
  await dialog.getByRole("button", { name: "@everyone" }).click();
  const sendRow = dialog.locator(".settings-row").filter({ hasText: "Send messages" });
  await sendRow.getByRole("button", { name: "Deny", exact: true }).click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Saved" })).toBeVisible();

  // Close via the overlay (the Permissions tab has no Cancel button).
  await page.locator(".modal-overlay").click({ position: { x: 5, y: 5 } });
  await expect(dialog).not.toBeVisible();

  // Member: can post in the control channel, is blocked in the restricted one.
  const { context, page: member } = await newMemberPage(browser, "Member E2E");
  try {
    const okBody = `member says hi ${Date.now()}`;
    await member.getByRole("button", { name: control, exact: true }).click();
    const okComposer = member.getByPlaceholder(`Message #${control}`);
    await okComposer.fill(okBody);
    await okComposer.press("Enter");
    await expect(member.getByText(okBody)).toBeVisible({ timeout: 10000 });

    const blockedBody = `should never appear ${Date.now()}`;
    await member.getByRole("button", { name: restricted, exact: true }).click();
    const composer = member.getByPlaceholder(`Message #${restricted}`);
    await composer.fill(blockedBody);
    await composer.press("Enter");
    // Give a real send time to round-trip, then require absence.
    await member.waitForTimeout(2000);
    await expect(member.getByText(blockedBody)).toBeHidden();

    // Owner double-checks nothing landed in the restricted channel.
    await page.getByRole("button", { name: restricted, exact: true }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText(blockedBody)).toBeHidden();
  } finally {
    await context.close();
  }
});
