import { test, expect } from "@playwright/test";
import { expectInHub, hubApi, uniqueName } from "./helpers/live";

// P24 — the profile editor's context dropdown (Discord server-profiles
// pattern): pick the default profile or any joined hub and edit that
// context in place. Hub contexts talk to that hub's own session
// (GET/PATCH /me); the default profile is local per-account storage.

async function openProfileEditor(page: import("@playwright/test").Page) {
  await page.locator(".btn-icon-gear").click();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  const section = page
    .locator(".settings-section", { has: page.getByText("Profile to edit", { exact: true }) })
    .first();
  await expect(section).toBeVisible({ timeout: 10000 });
  return section;
}

test("edit the profile on a hub picked from the context dropdown", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  const section = await openProfileEditor(page);

  // Pick the first hub context (index 0 is the default profile).
  await section.locator("#profile-context-select").selectOption({ index: 1 });

  const dispName = uniqueName("xX_Player");
  const nameInput = section.getByPlaceholder("Display name");
  await expect(nameInput).toBeVisible({ timeout: 10000 });
  await nameInput.fill(dispName);
  await section.getByLabel("Pronouns").fill("they/them");
  await section.getByLabel("About me").fill("Bio set by the live e2e pass.");
  await section.getByRole("button", { name: /^Save changes/ }).click();

  // /me now reflects the whole profile — the hub stored it.
  type Me = { display_name: string | null; bio: string | null; pronouns: string | null };
  await expect.poll(async () => (await hubApi<Me>(page, "/me")).display_name).toBe(dispName);
  const me = await hubApi<Me>(page, "/me");
  expect(me.pronouns).toBe("they/them");
  expect(me.bio).toBe("Bio set by the live e2e pass.");
});

test("save a default profile for the account", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  const section = await openProfileEditor(page);
  // The dropdown starts on the default-profile context.
  await expect(section.locator("#profile-context-select")).toHaveValue("__default__");

  const name = uniqueName("Default");
  await section.getByPlaceholder("Display name").fill(name);
  await section.getByRole("button", { name: /^Save changes/ }).click();
  await expect(section.getByText("Saved")).toBeVisible();

  // Purely local: nothing on the hub changed because of the default profile.
  const me = await hubApi<{ display_name: string | null }>(page, "/me");
  expect(me.display_name).not.toBe(name);
});
