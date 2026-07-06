import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, hubApi, newMemberPage, uniqueName } from "./helpers/live";

// P18 — admin features ported from desktop: audit log, native bots, hub
// icon library, alliances, onboarding (lobby/challenge), and per-channel
// bans. Each is gated on admin (the owner session is admin).

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
  // The suite has generated plenty of audit activity by now.
  await expect(page.locator("table.members-table tbody tr").first()).toBeVisible({ timeout: 10000 });
});

test("create and delete a native bot", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openAdminTab(page, "Native bots");
  await expect(page.getByRole("heading", { name: "Native bots" })).toBeVisible();

  const botName = uniqueName("Botty");
  await page.getByPlaceholder("Bot name").fill(botName);
  await page.getByRole("button", { name: "Create bot" }).click();
  // Token shown once.
  await expect(page.getByText("Token (shown once):")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Done" }).click();

  const row = page.locator("table.members-table tr", { hasText: botName });
  await expect(row).toBeVisible();
  page.on("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(row).toBeHidden({ timeout: 10000 });
});

test("create and delete a hub SVG icon", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openAdminTab(page, "Icons");
  await expect(page.getByRole("heading", { name: "Icon library" })).toBeVisible();

  const iconName = uniqueName("star");
  await page.getByPlaceholder("Icon name").fill(iconName);
  await page.getByText("Advanced: paste SVG markup").click();
  await page.getByLabel("SVG markup").fill('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>');
  await page.getByRole("button", { name: "Add icon" }).click();

  const card = page.locator(".settings-section", { hasText: iconName });
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.getByRole("button", { name: "Delete" }).click();
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
  await page.getByPlaceholder("Alliance name").fill(name);
  await page.getByRole("button", { name: "Create alliance" }).click();

  const section = page.locator(".alliance-row", { hasText: name });
  await expect(section).toBeVisible({ timeout: 10000 });

  // Expand the alliance and share the channel.
  await section.getByRole("button", { name: new RegExp(name) }).click();
  await section.locator("select").selectOption({ label: chan });
  await section.getByRole("button", { name: "Share", exact: true }).click();
  await expect(section.getByText(`# ${chan}`, { exact: false })).toBeVisible({ timeout: 10000 });

  // Unshare it.
  await section.getByRole("button", { name: "Unshare" }).click();
  await expect(section.getByText("No channels shared yet.")).toBeVisible({ timeout: 10000 });

  // Leave the alliance.
  await section.getByRole("button", { name: "Leave" }).click();
  await expect(page.locator(".alliance-row", { hasText: name })).toBeHidden({ timeout: 10000 });
});

test("onboarding: save challenge settings", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openAdminTab(page, "Onboarding");
  await expect(page.getByRole("heading", { name: "Onboarding" })).toBeVisible();

  // Challenge settings are write-only; saving should report success.
  await page.getByRole("button", { name: "Save challenge" }).click();
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
    const users = await hubApi<Array<{ public_key: string; display_name: string | null }>>(page, "/users");
    const pk = users.find((u) => u.display_name === memberName)!.public_key;

    const channel = uniqueName("banch");
    await createChannel(page, channel);
    const row = channelButton(page, channel);
    await row.hover();
    await row.getByRole("button", { name: "Channel settings" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Bans", exact: true }).click();

    await dialog.getByPlaceholder("Public key to ban").fill(pk);
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
