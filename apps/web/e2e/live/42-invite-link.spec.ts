import { test, expect } from "@playwright/test";
import { expectInHub, hubApi, HUB_URL, openSettingRow } from "./helpers/live";

// P42 — a created invite shows a link a human can actually open.
//
// This asserted `wavvon://<host>/i/<hubSerial>/<code>` until the invite link
// was changed to open the app rather than serve raw JSON (server 2a818eb):
// `buildInviteLink` now produces `http(s)://<host>/join/<code>`. A wavvon://
// link needs an installed app to handle it, and with web as the delivery target
// there is not one. `parseHubInput` still *accepts* the serial form, so an old
// link keeps working; nothing generates one any more.
//
// The companion test asserting the serial was the hub's own public key is gone
// with the format. The serial is not in the link, and a test kept alive by
// rewriting it around the thing it was checking checks nothing.

async function openInvites(page: import("@playwright/test").Page) {
  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Hub settings" }).click();
  await page.getByRole("button", { name: "Invites", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Invites" })).toBeVisible({ timeout: 10000 });
}

test("a created invite shows a joinable link", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openInvites(page);

  const create = await openSettingRow(page, "Create invite");
  await create.getByRole("button", { name: "Create invite", exact: true }).click();

  // Host derived from HUB_URL rather than hardcoded to localhost:3000, so this
  // holds against whatever hub the suite was pointed at — including the one CI
  // starts on its own port.
  const host = HUB_URL.replace(/^https?:\/\//i, "").replace(/\/+$/, "");

  // Each invite is its own row, titled with its code, and the link is in the
  // form that row opens to. Any invite carries the same shape, so ask the hub
  // for a code that exists rather than guessing a row's position in the list.
  const invites = await hubApi<Array<{ code: string }>>(page, "/invites");
  expect(invites.length).toBeGreaterThan(0);
  const row = await openSettingRow(page, invites[0].code);
  const link = row.locator("code.pubkey-display").first();
  await expect(link).toBeVisible({ timeout: 10000 });

  const text = (await link.textContent()) ?? "";
  expect(text).toContain(`${host}/join/`);
  expect(text).toMatch(/^https?:\/\//);
});
