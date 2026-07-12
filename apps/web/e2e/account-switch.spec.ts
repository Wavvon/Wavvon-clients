import { test, expect } from "@playwright/test";
import { injectTwoAccountSession, mockJson, HUB_URL, ACCOUNT1, ACCOUNT2 } from "./helpers/mockApi";

// Account switching regression (found in live testing 2026-07-12):
// 1. the reload must show the transition overlay, not a white flash —
//    painted pre-reload and repainted by index.html's inline script;
// 2. a switch initiated from Settings must land back in Settings → Account
//    (the one-shot return flag raced StrictMode when consumed during render).

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

test("switching accounts shows the overlay and returns to Settings → Account", async ({ page }) => {
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

  // Switch to account 2. The overlay must paint synchronously before the
  // reload navigation begins.
  await row2.getByRole("button", { name: "Switch", exact: true }).click();
  await expect(page.locator("#account-switch-overlay")).toBeVisible();

  // After the reload: no re-navigation by the test — the app must come back
  // on its own, land in Settings → Account, and show account 2 as active.
  await expect(page.locator(".settings-nav")).toBeVisible({ timeout: 15000 });
  const tableAfter = page.locator(".members-table");
  await expect(tableAfter).toBeVisible();
  const row2After = tableAfter.locator("tr", { hasText: ACCOUNT2.label });
  await expect(row2After.getByRole("button", { name: "Active" })).toBeDisabled();
  const activeId = await page.evaluate(() => localStorage.getItem("wavvon:active_account_id"));
  expect(activeId).toBe(ACCOUNT2.pubkey);

  // The overlay must be gone once the UI is up, and the one-shot flags
  // consumed (a leftover flag would replay the redirect on the next reload).
  await expect(page.locator("#account-switch-overlay")).toHaveCount(0);
  const leftoverFlags = await page.evaluate(() => [
    sessionStorage.getItem("wavvon:post_switch_return"),
    sessionStorage.getItem("wavvon:switch_overlay_text"),
  ]);
  expect(leftoverFlags).toEqual([null, null]);
});
