import { test, expect } from "@playwright/test";
import { injectTwoAccountSession, mockJson, HUB_URL, HUB_ID, ACCOUNT1, ACCOUNT2 } from "./helpers/mockApi";

// "Manage any account without switching" (the "Managing" selector owned by
// SettingsPage, see ManagingAccountSelector.tsx / AccountBlockIgnoreSection.tsx /
// platform/hubFetchAs.ts): selecting a non-active on-device account in the
// dropdown re-scopes the per-account sections to it — without switching,
// without touching the active account pointer, and (for session-bound
// hub state like dm-blocks) presenting a token acquired for that account
// specifically rather than the active account's own token. The selection is
// shared across the Privacy/Devices/Manage-accounts tabs, so it must survive
// tab changes.

const SECONDARY_TOKEN = "secondary-account-token";

const ME_INFO = {
  public_key: ACCOUNT1.pubkey,
  display_name: "Tester",
  avatar: null,
  approval_status: "approved",
  roles: [],
};

async function setupBaseRoutes(page: import("@playwright/test").Page) {
  await injectTwoAccountSession(page);
  // Pre-seed a distinct token in account 2's own namespace so hubFetchAs
  // finds it cached (see storage.ts saveToken/loadToken) and the mock
  // environment never has to run a real challenge/verify dance.
  await page.addInitScript(
    ({ pubkey2, hubId, token }) => {
      localStorage.setItem(`wavvon:acct:${pubkey2}:wavvon:token:${hubId}`, token);
    },
    { pubkey2: ACCOUNT2.pubkey, hubId: HUB_ID, token: SECONDARY_TOKEN },
  );

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
      url.includes("/identity") ||
      // Never falls through to a real hub that might genuinely be running
      // on localhost:3000 in dev — a live "member"/"lobby" answer here
      // would otherwise send this test down the WS-auth/reauth cascade a
      // real (non-mock) hub session goes through.
      url.includes("/lobby") ||
      url.includes("/survey") ||
      url.includes("/health")
    ) {
      void route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    } else {
      void route.fallback();
    }
  });

  // More precise shapes for the per-account sections than the generic "[]"
  // catch-all above (registered afterwards, so these take precedence).
  await page.route(`${HUB_URL}/identity/*/designation`, (route) => {
    void route.fulfill({ status: 404, body: "No designation" });
  });
  await page.route(`${HUB_URL}/identity/*/devices`, (route) => {
    void route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await mockJson(page, `${HUB_URL}/me/credentials`, []);
  await mockJson(page, `${HUB_URL}/me/devices`, []);
}

async function openSettingsTab(page: import("@playwright/test").Page, name: string) {
  await page.locator(".settings-nav").getByRole("button", { name, exact: true }).click();
}

test("selecting a non-active account in the Managing dropdown re-scopes sections without switching", async ({ page }) => {
  await setupBaseRoutes(page);

  const dmBlocksRequestForSecondary = page.waitForRequest(
    (req) =>
      req.url() === `${HUB_URL}/identity/dm-blocks` &&
      req.headers()["authorization"] === `Bearer ${SECONDARY_TOKEN}`,
  );

  await page.goto("/");
  await page.locator(".btn-icon-gear").first().click({ timeout: 10000 });
  await openSettingsTab(page, "Privacy");

  const managingSelect = page.locator("#managing-account-select");
  await expect(managingSelect).toBeVisible();
  await expect(managingSelect).toHaveValue(ACCOUNT1.pubkey);

  await managingSelect.selectOption(ACCOUNT2.pubkey);

  // Section labels now read the secondary account, not the active one.
  await expect(page.locator(".settings-label", { hasText: "Blocked users" })).toContainText(ACCOUNT2.label);

  // hubFetchAs (platform/hubFetchAs.ts) presented account 2's own
  // pre-cached token for the session-bound dm-blocks read, not account 1's.
  const req = await dmBlocksRequestForSecondary;
  expect(req.headers()["authorization"]).toBe(`Bearer ${SECONDARY_TOKEN}`);

  // The managing selection is owned by SettingsPage, not the tab — moving to
  // Devices and Manage accounts must keep account 2 selected and re-scope
  // those tabs' sections to it too.
  await openSettingsTab(page, "Devices");
  await expect(page.locator("#managing-account-select")).toHaveValue(ACCOUNT2.pubkey);
  await expect(page.locator(".settings-label", { hasText: "Devices" }).first()).toContainText(ACCOUNT2.label);

  await openSettingsTab(page, "Manage accounts");
  await expect(page.locator("#managing-account-select")).toHaveValue(ACCOUNT2.pubkey);
  await expect(page.locator(".settings-label", { hasText: "Home hubs" })).toContainText(ACCOUNT2.label);

  // The active account pointer never moved — this was management, not a
  // switch (see AccountRoot.tsx / identity/store.ts switchAccount).
  const activeId = await page.evaluate(() => localStorage.getItem("wavvon:active_account_id"));
  expect(activeId).toBe(ACCOUNT1.pubkey);
});
