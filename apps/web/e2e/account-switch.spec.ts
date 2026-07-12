import { test, expect } from "@playwright/test";
import { injectTwoAccountSession, mockJson, HUB_URL, ACCOUNT1, ACCOUNT2 } from "./helpers/mockApi";

// Account switching is an in-place key-remount, not a page reload (see
// AccountRoot.tsx / identity/store.ts switchAccount): no white flash to
// paper over, so there's no overlay, and the tab never navigates.

const ME_INFO = {
  public_key: ACCOUNT1.pubkey,
  display_name: "Tester",
  avatar: null,
  approval_status: "approved",
  roles: [],
};

async function setupBaseRoutes(page: import("@playwright/test").Page) {
  await injectTwoAccountSession(page);
  await mockJson(page, `${HUB_URL}/channels`, []);
  await mockJson(page, `${HUB_URL}/users`, []);
  await mockJson(page, `${HUB_URL}/me`, ME_INFO);
  await mockJson(page, `${HUB_URL}/conversations`, []);
  await mockJson(page, `${HUB_URL}/alliances`, []);
  await page.route(`${HUB_URL}/**`, (route) => {
    const url = route.request().url();
    if (
      url.includes("/bots") ||
      url.includes("/voice") ||
      url.includes("/dh-key") ||
      url.includes("/unread") ||
      url.includes("/dm-blocks") ||
      url.includes("/identity")
    ) {
      void route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    } else {
      void route.fallback();
    }
  });
}

async function openAccountTab(page: import("@playwright/test").Page) {
  await page.locator(".btn-icon-gear").first().click({ timeout: 10000 });
  await page.locator(".settings-nav").getByRole("button", { name: "Account", exact: true }).click();
}

test("switching accounts happens in place — no overlay, no reload, lands back on Settings → Account", async ({ page }) => {
  await setupBaseRoutes(page);
  await page.goto("/");
  await openAccountTab(page);

  // Both seeded accounts render; account 1 is active (disabled "Active").
  const table = page.locator(".members-table");
  await expect(table.getByText(ACCOUNT1.label)).toBeVisible();
  await expect(table.getByText(ACCOUNT2.label)).toBeVisible();
  const row1 = table.locator("tr", { hasText: ACCOUNT1.label });
  const row2 = table.locator("tr", { hasText: ACCOUNT2.label });
  await expect(row1.getByRole("button", { name: "Active" })).toBeDisabled();

  // Proves no navigation happens: a real reload would wipe this.
  await page.evaluate(() => { (window as unknown as { __noReloadMarker?: number }).__noReloadMarker = 42; });

  await row2.getByRole("button", { name: "Switch", exact: true }).click();

  // The switch is a synchronous key-remount — no transition overlay ever
  // gets attached, at any point.
  await expect(page.locator("#account-switch-overlay")).toHaveCount(0);

  // Settings → Account for the new account, account 2 now shows as active.
  await expect(page.locator(".settings-nav")).toBeVisible({ timeout: 15000 });
  const tableAfter = page.locator(".members-table");
  await expect(tableAfter).toBeVisible();
  const row2After = tableAfter.locator("tr", { hasText: ACCOUNT2.label });
  await expect(row2After.getByRole("button", { name: "Active" })).toBeDisabled();

  const activeId = await page.evaluate(() => localStorage.getItem("wavvon:active_account_id"));
  expect(activeId).toBe(ACCOUNT2.pubkey);

  // No navigation occurred — the marker set before the switch survived it.
  const marker = await page.evaluate(() => (window as unknown as { __noReloadMarker?: number }).__noReloadMarker);
  expect(marker).toBe(42);

  // Switch cooldown: immediately after a switch, every row's Switch button
  // (including the now-inactive account 1's) is disabled for a few seconds
  // to protect the remount + hub-reconnect window. Not asserting
  // re-enablement here — that's covered by the cooldown unit tests without
  // a time-based wait.
  const row1After = tableAfter.locator("tr", { hasText: ACCOUNT1.label });
  await expect(row1After.getByRole("button", { name: "Switch", exact: true })).toBeDisabled();
});
