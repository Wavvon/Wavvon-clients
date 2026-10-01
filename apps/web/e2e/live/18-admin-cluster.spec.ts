import { test, expect, type Page } from "@playwright/test";
import { channelButton, confirmInApp, createChannel, expectInHub, hubApi, newMemberPage, openSettingRow, settingRow, uniqueName } from "./helpers/live";

// P18 — admin features ported from desktop: audit log, hub icon library,
// alliances, onboarding (lobby/challenge), and per-channel bans. Each is
// gated on admin (the owner session is admin).

async function openAdminTab(page: Page, tab: string) {
  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Hub settings" }).click();
  await page.getByRole("button", { name: tab, exact: true }).click();
}

test("audit log lists administrative events", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openAdminTab(page, "Audit log");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  // The suite has generated plenty of audit activity by now. The log is a
  // list of entries grouped by day, not a table.
  await expect(page.locator(".audit-entry").first()).toBeVisible({ timeout: 10000 });
});

test("create and delete a hub SVG icon", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openAdminTab(page, "Icons");
  await expect(page.getByRole("heading", { name: "Icon library" })).toBeVisible();

  const iconName = uniqueName("star");
  const add = await openSettingRow(page, "Add an icon");
  await add.getByPlaceholder("Icon name").fill(iconName);
  await add.getByText("Advanced: paste SVG markup").click();
  await add.getByLabel("SVG markup").fill('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>');
  await add.getByRole("button", { name: "Add icon" }).click();

  // Each icon is its own row, and Delete is in the form it opens to.
  const card = await openSettingRow(page, iconName);
  await card.getByRole("button", { name: "Delete" }).click();
  await confirmInApp(page);
  await expect(card).toBeHidden({ timeout: 10000 });
});

test("alliance: create, share a channel, unshare, leave", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expectInHub(page);

  // A channel to share into the alliance.
  const chan = uniqueName("shared");
  await createChannel(page, chan);

  await openAdminTab(page, "Alliances");
  await expect(page.getByRole("heading", { name: "Alliances" })).toBeVisible();

  const name = uniqueName("Pact");
  const create = await openSettingRow(page, "Create alliance");
  await create.getByPlaceholder("Alliance name").fill(name);
  await create.getByRole("button", { name: "Create alliance" }).click();

  // The alliances themselves are in the form the "Your alliances" row opens
  // to; opening it closes the creator above.
  const yours = await openSettingRow(page, "Your alliances");
  const section = yours.locator(".alliance-row", { hasText: name });
  await expect(section).toBeVisible({ timeout: 10000 });

  // Expand the alliance and share the channel. The select's option label
  // carries the channel's "# " icon prefix (AlliancesSection.tsx), not the
  // bare name.
  await section.getByRole("button", { name: new RegExp(name) }).click();
  await section.locator("select").selectOption({ label: `# ${chan}` });
  await section.getByRole("button", { name: "Share", exact: true }).click();
  // getByText also matches the (still-present) <option> with the same label
  // in the share select — scope to the shared-channel row itself.
  await expect(section.locator(".settings-row", { hasText: `# ${chan}` })).toBeVisible({ timeout: 10000 });

  // Unshare it.
  await section.getByRole("button", { name: "Unshare" }).click();
  await expect(section.getByText("No channels shared yet.")).toBeVisible({ timeout: 10000 });

  // Leave the alliance.
  await section.getByRole("button", { name: "Leave" }).click();
  await confirmInApp(page);
  await expect(page.locator(".alliance-row", { hasText: name })).toBeHidden({ timeout: 10000 });
});

test("onboarding: save challenge settings", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openAdminTab(page, "Onboarding");
  await expect(page.getByRole("heading", { name: "Onboarding" })).toBeVisible();

  // Challenge settings are write-only; saving should report success.
  const challenge = await openSettingRow(page, "Anti-spam challenge");
  await challenge.getByRole("button", { name: "Save challenge" }).click();
  await expect(page.getByText("Challenge settings saved")).toBeVisible({ timeout: 10000 });
});

test("channel bans: ban and unban a real member", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  // The ban target must be a real user (FK constraint), so onboard one.
  const memberName = uniqueName("Banned");
  const { context } = await newMemberPage(browser, memberName);
  try {
    const channel = uniqueName("banch");
    await createChannel(page, channel);
    const row = channelButton(page, channel);
    await row.hover();
    await row.getByRole("button", { name: "Channel settings" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Bans", exact: true }).click();

    // The bans tab picks the target from the member list (a select), not a
    // raw pubkey field, when the caller (App.tsx) supplies the users prop.
    await dialog.getByLabel("User to ban").selectOption({ label: memberName });
    await dialog.getByRole("button", { name: "Ban", exact: true }).click();

    // The ban entry renders with an Unban button (pubkey is formatted, so
    // target the button rather than matching the key text).
    const unban = dialog.getByRole("button", { name: "Unban" });
    await expect(unban).toBeVisible({ timeout: 10000 });
    await unban.click();
    await expect(dialog.getByText("No one is banned from this channel.")).toBeVisible({ timeout: 10000 });

    // Confirm via API too.
    const channels = await hubApi<Array<{ id: string; name: string }>>(page, "/channels");
    const ch = channels.find((c) => c.name === channel)!;
    const bans = await hubApi<unknown[]>(page, `/channels/${ch.id}/bans`);
    expect(bans.length).toBe(0);
  } finally {
    await context.close();
  }
});

// The moderation queue. Hoisted into packages/ui 2026-09-08 so desktop could
// have it too, and it had no e2e coverage on either side until then — a
// shared component reached through two different transports is exactly the
// thing worth mounting for real once.
test("the moderation tab shows the content report queue", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openAdminTab(page, "Moderation");

  // Each of the three sections is one settings row, and a row's own line is
  // computed from what the hub answered — so reading the line is what says
  // the fetch landed. An error renders in the body instead, and none of these
  // lines can be reached by a section that rendered its own defaults.
  //
  // Nobody has reported anything on this hub, and saying so is the section
  // having loaded.
  const reports = settingRow(page, "Content reports");
  await expect(reports).toBeVisible({ timeout: 10000 });
  await expect(reports.locator(".setting-row-state")).toHaveText("No pending reports.", {
    timeout: 10000,
  });

  // The automod webhook sits in the same tab and was hoisted with it. Its
  // circuit-breaker state is what says the section reached the hub.
  const automod = settingRow(page, "Auto-moderation webhook");
  await expect(automod.locator(".setting-row-state")).toContainText("Circuit closed", {
    timeout: 10000,
  });

  // Federated ban lists, the third hoisted section. Whether our own list is
  // published comes from the hub, so stating it at all means the fetch landed.
  const banlist = settingRow(page, "Federated ban lists");
  await expect(banlist.locator(".setting-row-state")).toContainText("our list is", {
    timeout: 10000,
  });
});
