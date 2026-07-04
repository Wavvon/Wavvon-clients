import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, hubApi, uniqueName } from "./helpers/live";

// The context menu is a fixed-position element rendered at the cursor Y, so
// a target row near the viewport bottom can push its items off-screen. We
// right-click the (scrolled-into-view) row to OPEN the menu, then fire the
// item via dispatchEvent so the click lands regardless of menu position.
async function clickMenuItem(page: Page, name: string) {
  await page.getByRole("button", { name }).dispatchEvent("click");
}

// P11 — channel / category / forum / banner CRUD via the right-click
// context menu. Create (type <select>) → rename (ctx "Edit…" →
// ChannelSettingsModal) → delete (ctx "Delete…" → confirm).
//
// Findings this exercises:
// - The web ChannelSettingsModal edits name + description only; there's no
//   banner-image/appearance editor on web (edit_banner/appearance context
//   items are desktop-only).
// - Banner channels now expose a management row (name + settings gear) to
//   admins and a right-click context menu, so they can be renamed/deleted from
//   the web sidebar like other channels.

async function rightClick(locator: import("@playwright/test").Locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.click({ button: "right" });
}

async function renameChannelRow(page: Page, oldName: string, newName: string) {
  await rightClick(channelButton(page, oldName));
  await clickMenuItem(page, `Edit "${oldName}"`);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").first().fill(newName);
  await dialog.locator(".modal-actions").getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

async function deleteChannelRow(page: Page, name: string, kind: "channel" | "category") {
  await rightClick(channelButton(page, name));
  await clickMenuItem(page, `Delete "${name}"`);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: `Delete ${kind}…` }).click();
  await dialog.getByRole("button", { name: "Yes, delete" }).click();
  await expect(dialog).not.toBeVisible();
}

for (const { label, kind } of [
  { label: "Text", kind: "text" },
  { label: "Forum", kind: "forum" },
] as const) {
  test(`${kind} channel: create, rename, delete`, async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/");
    await expectInHub(page);

    const name = uniqueName(kind);
    await createChannel(page, name, label);
    await expect(channelButton(page, name)).toBeVisible();

    const renamed = uniqueName(`${kind}-r`);
    await renameChannelRow(page, name, renamed);
    await expect(channelButton(page, renamed)).toBeVisible();
    await expect(channelButton(page, name)).toHaveCount(0);

    await deleteChannelRow(page, renamed, "channel");
    await expect(channelButton(page, renamed)).toHaveCount(0);
  });
}

test("category: create, rename, delete", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expectInHub(page);

  const name = uniqueName("cat");
  await createChannel(page, name, "Category");
  // Categories render as a group header (uppercased name), not a channel button.
  const group = (n: string) => page.getByRole("group", { name: new RegExp(n, "i") });
  await expect(group(name)).toBeVisible();

  // Rename via the category header's context menu (the header div carries
  // onContextMenu; it's the first button inside the group).
  const renamed = uniqueName("cat-r");
  const header = (n: string) => group(n).getByRole("button").first();
  await rightClick(header(name));
  await clickMenuItem(page, `Edit "${name}"`);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").first().fill(renamed);
  await dialog.locator(".modal-actions").getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(group(renamed)).toBeVisible();

  // Delete via the category header's context menu.
  await rightClick(header(renamed));
  await clickMenuItem(page, `Delete "${renamed}"`);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete category…" }).click();
  await dialog.getByRole("button", { name: "Yes, delete" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(group(renamed)).toHaveCount(0);
});

test("banner channel: create, then manage (name + gear) and delete", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expectInHub(page);

  const name = uniqueName("bnr");
  await createChannel(page, name, "Banner");

  const channels = await hubApi<Array<{ name: string; channel_type: string }>>(page, "/channels");
  expect(channels.find((c) => c.name === name)?.channel_type).toBe("banner");

  // Admins get a management row (name + settings gear) even with no image —
  // previously a bannerless banner was an empty, unmanageable <li>.
  const row = page.locator(".channel-banner-manage", { hasText: name }).first();
  await expect(row).toBeVisible({ timeout: 10000 });
  await expect(row.locator(".channel-settings-btn")).toBeVisible();

  // Delete via the banner's right-click context menu.
  await rightClick(row);
  await clickMenuItem(page, `Delete "${name}"`);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete channel…" }).click();
  await dialog.getByRole("button", { name: "Yes, delete" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".channel-banner-manage", { hasText: name })).toHaveCount(0);
});
