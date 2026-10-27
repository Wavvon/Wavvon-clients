import { test, expect, type Page } from "@playwright/test";
import { expectInHub, hubApi, newMemberPage, openSettingRow, uniqueName } from "./helpers/live";

// P70 — recovery without raw keys or ids (Wavvon-clients#169, with
// Wavvon-server#190). Three real clients: the owner names a member as a
// recovery contact by picking them from a list; a newcomer, standing in for
// the owner on a new key, opens a request by picking the owner's name; the
// contact finds that request in their own settings, without being sent its
// id, and confirms it.
//
// The request is never approved, so the owner's identity is untouched for the
// specs that follow.

async function openManageAccounts(page: Page) {
  await page.locator(".btn-icon-gear").click();
  await page.locator(".settings-nav").getByRole("button", { name: "Manage accounts", exact: true }).click();
}

test("a contact is picked by name and finds the request that names them", async ({ page, browser }) => {
  test.setTimeout(120000);
  const info = await (await page.request.get(`${process.env.WAVVON_E2E_HUB_URL ?? "http://localhost:3000"}/info`)).json();
  test.skip(!info.capabilities?.includes("recovery.attest.requests"), "hub cannot list requests to their contacts");

  await page.goto("/");
  await expectInHub(page);
  const owner = await hubApi<{ display_name: string | null }>(page, "/me");
  const ownerName = owner.display_name ?? "";

  const contactName = uniqueName("Contact");
  const contact = await newMemberPage(browser, contactName);
  const newcomer = await newMemberPage(browser, uniqueName("NewKey"));
  try {
    // The owner names the contact by picking them, and the threshold reads
    // as a sentence that starts from a majority, never 0.
    await openManageAccounts(page);
    const contacts = await openSettingRow(page, "Recovery contacts for this hub");
    await contacts.getByRole("searchbox").fill(contactName);
    await contacts.getByRole("checkbox", { name: contactName }).check();
    await expect(contacts.getByText("of your 1 contact must confirm it's you")).toBeVisible();
    await contacts.getByRole("button", { name: "Save contacts" }).click();
    await expect(contacts.getByText("Saved.")).toBeVisible({ timeout: 10000 });

    // The newcomer finds the account they "were" by its name.
    await openManageAccounts(newcomer.page);
    const request = await openSettingRow(newcomer.page, "Recover your standing on this hub");
    await request.getByRole("searchbox", { name: "Who were you on this hub?" }).fill(ownerName);
    await request.getByRole("radio", { name: ownerName }).first().check();
    await request.getByRole("button", { name: "Open request" }).click();
    await expect(request.getByText("0 of 1 contacts confirmed")).toBeVisible({ timeout: 10000 });

    // The contact sees it waiting, named, and confirms.
    await openManageAccounts(contact.page);
    const vouch = await openSettingRow(contact.page, "Vouch for someone else's request");
    await expect(vouch.getByText(`${ownerName} (now using a new key) asks you to confirm it's them.`)).toBeVisible({ timeout: 15000 });
    await vouch.getByRole("button", { name: "Confirm — this is them" }).click();
    await expect(vouch.getByText("Attestation recorded. Thank you.")).toBeVisible({ timeout: 10000 });
  } finally {
    await contact.context.close();
    await newcomer.context.close();
  }
});
