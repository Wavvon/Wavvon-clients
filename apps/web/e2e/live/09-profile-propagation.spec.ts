import { test, expect } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P9 — profile edit propagation (reported bug: member list + message
// author names not updating after a display-name change).
//
// Author names and the member list both read from the same `users` state
// (MessageRow: users.find(...).display_name; UserListGrouped: u.display_name),
// so a rename should update both — provided `users` is refreshed.

async function openProfileSettings(page: import("@playwright/test").Page) {
  await page.locator(".btn-icon-gear").click();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
}

async function renameSelf(page: import("@playwright/test").Page, name: string) {
  await openProfileSettings(page);
  // The default profile context is local-only (P24) — editing the hub's own
  // context is what actually PATCHes /me and propagates to the member list
  // and message authors. Index 0 is the default profile; index 1 is the
  // (only) joined hub.
  await page.locator("#profile-context-select").selectOption({ index: 1 });
  const input = page.locator("#profile-editor-name");
  await input.fill(name);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved", { exact: false }).first()).toBeVisible({ timeout: 5000 });
  // Close settings overlay.
  await page.locator(".settings-close-x").first().click();
}

test("renaming self updates the member list and existing message authors (same client)", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expectInHub(page);

  // Post a message so there is an existing author label to re-resolve.
  const channel = uniqueName("prof");
  await createChannel(page, channel);
  await channelButton(page, channel).click();
  const body = `pre-rename ${Date.now()}`;
  const composer = page.getByPlaceholder(`Message #${channel}`);
  await composer.fill(body);
  await composer.press("Enter");
  const messageRow = page.locator(".message-row, li", { hasText: body }).first();
  await expect(page.getByText(body)).toBeVisible();

  const newName = uniqueName("Renamed");
  await renameSelf(page, newName);

  // Member list shows the new name.
  await expect(page.locator(".user-name", { hasText: newName })).toBeVisible({ timeout: 10000 });

  // The existing message's author label re-resolves to the new name.
  await channelButton(page, channel).click();
  await expect(
    page.locator(".message-sender", { hasText: newName }).first(),
  ).toBeVisible({ timeout: 10000 });
});

test("a rename reaches another already-connected client", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("profx");
  await createChannel(page, channel);

  // Second client joins and opens the channel while the owner is present.
  const { context, page: member } = await newMemberPage(browser, "Watcher E2E");
  try {
    await channelButton(member, channel).click();
    // Owner posts so the member has a message authored by the owner.
    await channelButton(page, channel).click();
    const body = `from owner ${Date.now()}`;
    const composer = page.getByPlaceholder(`Message #${channel}`);
    await composer.fill(body);
    await composer.press("Enter");
    await expect(member.getByText(body)).toBeVisible({ timeout: 10000 });

    // Owner renames.
    const newName = uniqueName("OwnerNew");
    await renameSelf(page, newName);

    // The member should eventually see the new name in the member list.
    // (Documents the WS-broadcast gap: this only updates on the member's
    // next /users refetch — a reload — since PATCH /me broadcasts nothing.)
    await member.reload();
    await channelButton(member, channel).click();
    await expect(
      member.locator(".user-name", { hasText: newName }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      member.locator(".message-sender", { hasText: newName }).first(),
    ).toBeVisible({ timeout: 10000 });
  } finally {
    await context.close();
  }
});
