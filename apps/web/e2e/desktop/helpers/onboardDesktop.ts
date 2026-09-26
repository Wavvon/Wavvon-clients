import { expect, type Page } from "@playwright/test";
import { HUB_URL } from "../../live/helpers/live";

// Getting the desktop app from a blank account store to "in the hub".
//
// It is not the web flow with different selectors: the desktop client opens on
// its own account gate (AccountRoot — the app has no identity at all until an
// account exists on this machine), and only then reaches the shared
// WelcomeScreen that joins a hub. Both screens are shared components, so the
// text below is what `packages/i18n` says, not desktop-only copy.

/** Create a fresh identity in the account gate. */
export async function createDesktopIdentity(page: Page, displayName?: string): Promise<void> {
  await expect(page.getByRole("heading", { name: "Welcome to Wavvon" })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Create new identity" }).click();
  await dismissSetupSteps(page, displayName);
}

/** Import an existing identity from its 24-word phrase. */
export async function importDesktopIdentity(page: Page, phrase: string): Promise<void> {
  await expect(page.getByRole("heading", { name: "Welcome to Wavvon" })).toBeVisible({
    timeout: 60_000,
  });
  await page.locator("textarea.recovery-input").fill(phrase);
  await page.getByRole("button", { name: "Import" }).click();
  await dismissSetupSteps(page);
}

/**
 * Join the hub the live suite is pointed at.
 *
 * Desktop does not land on the WelcomeScreen the way web does: with an
 * identity but no hubs it shows its own empty state ("No hubs connected") and
 * joins through AddHubModal, which is the same modal the `+` in the hub
 * sidebar opens.
 */
export async function joinHub(
  page: Page,
  displayName: string,
  address: string = HUB_URL,
): Promise<void> {
  await page.getByRole("button", { name: "Add hub" }).click({ timeout: 60_000 });
  const url = page.getByPlaceholder(/hub\.example\.com/);
  await expect(url).toBeVisible({ timeout: 30_000 });
  // An invite link rather than a bare address, because a fresh hub is
  // invite_only and desktop's AddHubModal has no separate invite-code field —
  // the code travels in the address, which is what `buildInviteLink` builds.
  await url.fill(address);
  await page.getByRole("button", { name: "Connect" }).click();

  // The display-name prompt is optional — an identity that already carries a
  // profile (a paired or imported one) never sees it.
  const nameInput = page.getByPlaceholder("Your name");
  await nameInput.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill(displayName);
    await page.getByRole("button", { name: "Save name" }).click();
  }
  await expect(page.getByText("No hubs connected.")).toBeHidden({ timeout: 60_000 });
  await expect(page.locator(".hub-header-button")).toBeVisible({ timeout: 60_000 });
}

/**
 * The steps every first-time identity walks through, each skippable and each
 * absent depending on how the identity arrived — so this waits briefly and
 * moves on rather than asserting.
 *
 * The nickname belongs here rather than after the join: desktop has no
 * display-name prompt of its own (web's `showDisplayNamePrompt` has no desktop
 * twin), so an identity that skips this step reaches the hub with an empty
 * `display_name` and shows up in the member list as a pubkey.
 */
async function dismissSetupSteps(page: Page, displayName?: string): Promise<void> {
  const label = page.getByRole("heading", { name: "Name this account" });
  await label.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
  if (await label.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  const profile = page.getByRole("heading", { name: "Set up your profile" });
  await profile.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
  if (await profile.isVisible().catch(() => false)) {
    if (displayName) {
      await page.getByPlaceholder("Your name").fill(displayName);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Skip for now" }).click();
    }
  }
}
