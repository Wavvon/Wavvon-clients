import type { Page, Route } from "@playwright/test";

const HUB_URL = "http://localhost:3000";
const HUB_ID = "test-hub-id";
const TOKEN = "test-token";
// Any valid 32-byte seed; the mock API stubs all hub calls, so the derived
// pubkey is never checked against a real challenge/verify.
const SEED_HEX = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
// publicKeyHex(SEED_HEX) — the account id under the multi-account model.
// Precomputed because the init script runs before any app code loads.
const PUBKEY = "3ccd241cffc9b3618044b97d036d8614593d8b017c340f1dee8773385517654b";

export async function injectSession(page: Page) {
  await page.addInitScript(
    ({ hubId, hubUrl, token, seedHex, pubkey }) => {
      // Multi-account: per-user localStorage is namespaced per account
      // (utils/accountScope.ts) and the identity store is DB version 2 with
      // the pubkey as the record id. Keep this in lockstep with store.ts.
      const scoped = (key: string) => `wavvon:acct:${pubkey}:${key}`;
      localStorage.setItem("wavvon:active_account_id", pubkey);
      // Saved hubs list
      localStorage.setItem(
        scoped("wavvon:saved_hubs"),
        JSON.stringify([
          {
            hub_id: hubId,
            hub_name: "Test Hub",
            hub_url: hubUrl,
            hub_icon: null,
            remember_token: true,
          },
        ])
      );
      // Active hub
      localStorage.setItem(scoped("wavvon:active_hub"), hubId);
      // Auth token (remember_token=true → localStorage)
      localStorage.setItem(scoped(`wavvon:token:${hubId}`), token);

      // The app shows the identity-setup screen unless an IndexedDB identity
      // exists, so seed the same record store.ts writes. Runs before the app
      // bundle, so it lands well before loadIdentity's effect fires.
      const open = indexedDB.open("wavvon", 2);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains("identity")) {
          db.createObjectStore("identity", { keyPath: "id" });
        }
      };
      open.onsuccess = () => {
        const db = open.result;
        db.transaction("identity", "readwrite")
          .objectStore("identity")
          .put({ id: pubkey, seed_hex: seedHex, security_nonce: 0, security_level: 0, account_label: "Test" });
      };
    },
    { hubId: HUB_ID, hubUrl: HUB_URL, token: TOKEN, seedHex: SEED_HEX, pubkey: PUBKEY }
  );
}

export function hubRoute(path: string) {
  return `${HUB_URL}${path}`;
}

export async function mockJson(page: Page, url: string, body: unknown, method = "GET") {
  await page.route(url, (route: Route) => {
    if (route.request().method() === method) {
      void route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    } else {
      void route.continue();
    }
  });
}

export async function mockEmpty(page: Page, url: string, method = "POST") {
  await page.route(url, (route: Route) => {
    if (route.request().method() === method) {
      void route.fulfill({ status: 204, body: "" });
    } else {
      void route.continue();
    }
  });
}

export { HUB_URL, HUB_ID, TOKEN };
