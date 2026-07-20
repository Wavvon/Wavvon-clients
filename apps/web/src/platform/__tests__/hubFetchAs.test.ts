import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActiveAccountId, type IdentityRecord } from "../../identity/store";
import { setSession, setActiveHubId, resetHubSessions } from "../session";
import { hubFetchAs } from "../hubFetchAs";

// hubFetchAs (see platform/hubFetchAs.ts) is the mechanism behind "manage any
// on-device account without switching": it authenticates as a SELECTED
// account against the ACTIVE hub, caching the resulting token under that
// account's own namespaced storage — the same place its own session would
// cache it once it becomes active — without ever touching the active
// account's session or WebSocket.

const localStorageData: Record<string, string> = {};
const sessionStorageData: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => localStorageData[k] ?? null,
  setItem: (k: string, v: string) => {
    localStorageData[k] = v;
  },
  removeItem: (k: string) => {
    delete localStorageData[k];
  },
});
vi.stubGlobal("sessionStorage", {
  getItem: (k: string) => sessionStorageData[k] ?? null,
  setItem: (k: string, v: string) => {
    sessionStorageData[k] = v;
  },
  removeItem: (k: string) => {
    delete sessionStorageData[k];
  },
});

const HUB_URL = "https://hub.example";
const HUB_ID = "hub-pub-key";
const ACTIVE_ID = "active-acct";
const OTHER_ID = "other-acct";

const activeAccount: IdentityRecord = {
  id: ACTIVE_ID,
  seed_hex: "aa".repeat(32),
  security_nonce: 0,
  security_level: 0,
};

const otherAccount: IdentityRecord = {
  id: OTHER_ID,
  seed_hex: "ff".repeat(32),
  security_nonce: 0,
  security_level: 0,
};

function resetStorages() {
  for (const k of Object.keys(localStorageData)) delete localStorageData[k];
  for (const k of Object.keys(sessionStorageData)) delete sessionStorageData[k];
}

beforeEach(() => {
  resetStorages();
  resetHubSessions();
  setActiveAccountId(ACTIVE_ID);
  setSession(HUB_ID, {
    hub_id: HUB_ID,
    hub_url: HUB_URL,
    hub_pubkey: HUB_ID,
    hub_name: "Hub",
    hub_icon: null,
    token: "active-token",
    ws: null,
  });
  setActiveHubId(HUB_ID);
});

describe("hubFetchAs", () => {
  it("is just hubFetch (the active session's own token) when the selected account IS active", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${HUB_URL}/some/path`);
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer active-token");
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await hubFetchAs(activeAccount, "/some/path");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("acquires a token via challenge/verify and caches it under the target account's own namespace", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === `${HUB_URL}/info`) {
        return new Response(JSON.stringify({ public_key: HUB_ID }), { status: 200 });
      }
      if (url === `${HUB_URL}/auth/challenge`) {
        return new Response(JSON.stringify({ challenge: "00".repeat(32) }), { status: 200 });
      }
      if (url === `${HUB_URL}/auth/verify`) {
        return new Response(JSON.stringify({ token: "token-for-other" }), { status: 200 });
      }
      if (url === `${HUB_URL}/some/path`) {
        return new Response("{}", { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await hubFetchAs(otherAccount, "/some/path");
    expect(res.ok).toBe(true);

    // Cached under wavvon:acct:<otherAccount.id>:wavvon:token:<hub_id> — the
    // exact key that account's own session would use once it becomes active
    // (see storage.ts saveToken/loadToken + utils/accountScope.ts).
    const cachedKey = `wavvon:acct:${OTHER_ID}:wavvon:token:${HUB_ID}`;
    expect(sessionStorageData[cachedKey]).toBe("token-for-other");
    expect(localStorageData[cachedKey]).toBeUndefined();

    // Never touched the active account's own session token.
    const activeKey = `wavvon:acct:${ACTIVE_ID}:wavvon:token:${HUB_ID}`;
    expect(sessionStorageData[activeKey]).toBeUndefined();
    expect(localStorageData[activeKey]).toBeUndefined();
  });

  it("reuses a cached token instead of re-running the challenge/verify dance", async () => {
    const cachedKey = `wavvon:acct:${OTHER_ID}:wavvon:token:${HUB_ID}`;
    sessionStorageData[cachedKey] = "already-cached-token";

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === `${HUB_URL}/some/path`) {
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer already-cached-token");
        return new Response("{}", { status: 200 });
      }
      throw new Error(`unexpected fetch ${url} — should have reused the cached token`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await hubFetchAs(otherAccount, "/some/path");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
