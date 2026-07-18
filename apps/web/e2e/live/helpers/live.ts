import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

// Live-hub test constants. The owner seed is deterministic: its pubkey is
// passed to the hub as WAVVON_OWNER_PUBKEY so the recovered identity lands
// as builtin-owner. See e2e/live/README.md for the launch recipe.
export const HUB_URL = "http://localhost:3000";
export const OWNER_SEED_HEX =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
export const OWNER_PUBKEY =
  "03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8";
export const OWNER_NAME = "Owner E2E";

// Unique per-run suffix so tests can re-run against a persistent hub DB
// without name collisions.
export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// Walk the first-run flow with a recovered identity, join the local hub,
// and dismiss the display-name prompt if it appears.
export async function onboardWithSeed(
  page: Page,
  seedHex: string,
  displayName: string,
  inviteCode?: string,
): Promise<void> {
  await page.goto("/");
  try {
    await page
      .getByRole("button", { name: "Recover existing identity" })
      .click({ timeout: 20000 });
  } catch (e) {
    const body = await page.locator("body").innerText().catch(() => "<no body>");
    throw new Error(`Identity setup screen never appeared. Body text: ${body.slice(0, 400)}`, { cause: e });
  }
  await page.getByPlaceholder(/a1b2c3d4/).fill(seedHex);
  await page.getByRole("button", { name: "Recover from hex" }).click();

  // Every first-time recover hits two mandatory local-only steps before the
  // WelcomeScreen: a required account label (clients f93e8c0, 2026-07-11)
  // and a local profile setup step — neither talks to a hub yet, so a fresh
  // IndexedDB (every test's browser context) hits both on every run.
  const labelStep = page.getByRole("heading", { name: "Name this account" });
  await labelStep.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  if (await labelStep.isVisible()) {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  const profileStep = page.getByRole("heading", { name: "Set up your profile" });
  await profileStep.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  if (await profileStep.isVisible()) {
    await page.getByPlaceholder("Your name").fill(displayName);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }

  // WelcomeScreen: single URL input + "Join hub". The main layout is
  // rendered *behind* the welcome overlay, so wait for the overlay itself
  // to go away — not for layout chrome to appear. Fresh hubs default to
  // invite_only=true (hub 10f3e2d, 2026-07-06) — a brand-new identity with
  // no roles yet needs a `/join/<code>` link (parseHubInput extracts the
  // code), not the bare host, or /auth/verify 403s.
  const joinInput = inviteCode ? `${HUB_URL}/join/${inviteCode}` : HUB_URL;
  await page.getByPlaceholder(/hub\.example\.com/).fill(joinInput);
  await page.getByRole("button", { name: "Join hub" }).click();
  await expect(page.getByRole("button", { name: "Join hub" })).toBeHidden({
    timeout: 20000,
  });

  // First join with no display name on the hub triggers the prompt.
  const namePrompt = page.getByText("What should we call you?");
  await namePrompt.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  if (await namePrompt.isVisible()) {
    await page.getByPlaceholder("Your name").fill(displayName);
    await page.getByRole("button", { name: "Save name" }).click();
  }
  await expectInHub(page);
}

// Assert the main hub UI is active: welcome overlay gone, sidebar present,
// and the hub session actually restored (the header shows the real hub
// name, not the "Hub" placeholder used while no hub is connected).
export async function expectInHub(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: "Join hub" })).toBeHidden({
    timeout: 15000,
  });
  await expect(page.locator(".hub-header-button")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".hub-header-name")).not.toHaveText("Hub", {
    timeout: 15000,
  });
}

// Onboard a brand-new random identity in a fresh context (a plain member,
// not the owner). Caller is responsible for context.close().
export async function newMemberPage(
  browser: Browser,
  displayName: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const seed = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0"),
  ).join("");
  // @playwright/test applies the project's use{} options (including the
  // owner storageState!) to browser.newContext — override with a blank
  // state so this really is a first-run identity.
  const context = await browser.newContext({
    baseURL: "http://localhost:1421",
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  const inviteCode = await ensureInviteCode(browser);
  await onboardWithSeed(page, seed, displayName, inviteCode);
  return { context, page };
}

// A sidebar channel button, tolerant of the "…, N unread messages" suffix
// the accessible name gains when the channel has unread activity.
export function channelButton(page: Page, name: string) {
  return page
    .getByRole("button", { name: new RegExp(`^${name}(,| )|^${name}$`) })
    .first();
}

// Authenticated REST call against the hub, using the page's own session
// token. For test SETUP only (e.g. creating a custom role where the web UI
// has no creation surface yet) — assertions should go through the UI.
export async function hubApi<T = unknown>(
  page: Page,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  return (await page.evaluate(
    async ({ hubUrl, path, method, body }) => {
      // The restored session re-authenticates asynchronously on load —
      // poll briefly until the fresh token lands in storage. Per-account
      // namespacing (clients f93e8c0, 2026-07-11 — utils/accountScope.ts)
      // means every key lives under `wavvon:acct:<accountId>:<key>`, not the
      // bare key.
      let token: string | null = null;
      for (let i = 0; i < 50 && !token; i++) {
        const accountId = localStorage.getItem("wavvon:active_account_id");
        const hubId = accountId ? localStorage.getItem(`wavvon:acct:${accountId}:wavvon:active_hub`) : null;
        token = accountId && hubId
          ? sessionStorage.getItem(`wavvon:acct:${accountId}:wavvon:token:${hubId}`) ??
            localStorage.getItem(`wavvon:acct:${accountId}:wavvon:token:${hubId}`)
          : null;
        if (!token) await new Promise((r) => setTimeout(r, 200));
      }
      const res = await fetch(`${hubUrl}${path}`, {
        method: method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    },
    { hubUrl: HUB_URL, path, method: init?.method, body: init?.body },
  )) as T;
}

// A single unlimited-use invite code, minted once per test process and
// reused by every newMemberPage call (fresh hubs default to invite_only=true
// — see onboardWithSeed). Reuses the owner's saved session (the "live"
// project's own storageState) rather than a full re-onboard, so this is
// cheap after the first call.
let cachedInviteCode: Promise<string> | null = null;

async function ensureInviteCode(browser: Browser): Promise<string> {
  if (!cachedInviteCode) {
    cachedInviteCode = (async () => {
      const context = await browser.newContext({
        baseURL: "http://localhost:1421",
        storageState: "e2e/.auth/owner.json",
      });
      try {
        const page = await context.newPage();
        await page.goto("/");
        await expectInHub(page);
        const invite = await hubApi<{ code: string }>(page, "/invites", {
          method: "POST",
          body: {},
        });
        return invite.code;
      } finally {
        await context.close();
      }
    })();
  }
  return cachedInviteCode;
}

// Create a channel via the hub-name dropdown → "Create…" modal.
// channelType is the visible label in the type <select> ("Text", "Forum",
// "Room Creator", "Category", ...). Returns the channel name.
export async function createChannel(
  page: Page,
  name: string,
  channelType?: string,
): Promise<string> {
  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Create…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  if (channelType) {
    await dialog.locator("select").selectOption({ label: channelType });
  }
  await dialog.getByPlaceholder(/channel-name|category-name/).fill(name);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  return name;
}
