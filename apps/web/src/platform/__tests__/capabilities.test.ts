import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setSession, setActiveHubId, resetHubSessions, hubSupports, activeHubSupports } from "../session";
import { saveSavedHubs, loadSavedHubs } from "../storage";
import { fetchAllUsers } from "../commands/users";
import { refreshHubInfo, listHubs } from "../commands/hubs";

// Capability advertising (decisions.md, "Hub capabilities are advertised, not
// inferred from a version number"). This client is multi-hub and its own
// version comes from whichever hub served the page, so what a hub can do has
// to be asked, per hub, and never derived from a version string.

// No DOM environment here (see hubFetchAs.test.ts, same shim) — the
// last-known-capabilities fallback reads localStorage through storage.ts.
const localStorageData: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => localStorageData[k] ?? null,
  setItem: (k: string, v: string) => {
    localStorageData[k] = v;
  },
  removeItem: (k: string) => {
    delete localStorageData[k];
  },
});

const HUB_URL = "https://hub.example";
const HUB_ID = "hub-pub-key";

function connect(capabilities?: string[]) {
  setSession(HUB_ID, {
    hub_id: HUB_ID,
    hub_url: HUB_URL,
    hub_pubkey: HUB_ID,
    hub_name: "Hub",
    hub_icon: null,
    token: "tok",
    ws: null,
    capabilities,
  });
  setActiveHubId(HUB_ID);
}

beforeEach(() => {
  resetHubSessions();
  for (const k of Object.keys(localStorageData)) delete localStorageData[k];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hubSupports", () => {
  it("answers from the live session", () => {
    connect(["list.cursor", "voice.wt"]);
    expect(hubSupports(HUB_ID, "voice.wt")).toBe(true);
    expect(hubSupports(HUB_ID, "recovery.attestation")).toBe(false);
  });

  // The whole point of persisting capabilities: a reload must not blank out
  // every gated feature for the frames before refreshHubInfo answers.
  it("falls back to the last known list when the session has none yet", () => {
    saveSavedHubs([
      {
        hub_id: HUB_ID,
        hub_name: "Hub",
        hub_url: HUB_URL,
        hub_icon: null,
        remember_token: false,
        capabilities: ["list.cursor"],
      },
    ]);
    connect(undefined);
    expect(hubSupports(HUB_ID, "list.cursor")).toBe(true);
    expect(hubSupports(HUB_ID, "voice.wt")).toBe(false);
  });

  // Unknown must mean "no". A hub that never said it can do something is
  // treated as unable to, so the feature is absent rather than erroring on a
  // route that isn't there.
  it("is false for a hub we know nothing about", () => {
    expect(hubSupports("never-seen", "list.cursor")).toBe(false);
    expect(activeHubSupports("list.cursor")).toBe(false);
  });

  it("is false when there is no active hub", () => {
    connect(["list.cursor"]);
    setActiveHubId(null);
    expect(activeHubSupports("list.cursor")).toBe(false);
  });
});

// A hub sharing a host with others lives at an owner-chosen name that can
// the current one as `canonical_url`, and the client follows it — keyed on the
// pubkey, which never changes. That is what makes following safe: we move
// where we look, not who we think we are talking to.
describe("refreshHubInfo following a renamed hub", () => {
  const OLD_URL = "https://host.example/hub/pippo";
  const NEW_URL = "https://host.example/hub/mangiadapippo";

  function connectAt(url: string) {
    setSession(HUB_ID, {
      hub_id: HUB_ID,
      hub_url: url,
      hub_pubkey: HUB_ID,
      hub_name: "Hub",
      hub_icon: null,
      token: "tok",
      ws: null,
      capabilities: [],
    });
    setActiveHubId(HUB_ID);
    saveSavedHubs([
      {
        hub_id: HUB_ID,
        hub_name: "Hub",
        hub_url: url,
        hub_icon: null,
        remember_token: false,
      },
    ]);
  }

  function infoResponse(extra: Record<string, unknown>) {
    return new Response(
      JSON.stringify({ public_key: HUB_ID, name: "Hub", icon: null, ...extra }),
      { status: 200 },
    );
  }

  it("adopts the new address and keeps the same hub_id", async () => {
    connectAt(OLD_URL);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      infoResponse({ canonical_url: NEW_URL }),
    );

    await refreshHubInfo(HUB_ID);

    expect(loadSavedHubs()[0].hub_url).toBe(NEW_URL);
    expect(loadSavedHubs()[0].hub_id).toBe(HUB_ID);
    // Subsequent calls must go to the new address, or the follow was cosmetic.
    expect(listHubs()[0].hub_url).toBe(NEW_URL);
  });

  it("leaves the address alone when the hub reports the same one", async () => {
    connectAt(OLD_URL);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      infoResponse({ canonical_url: OLD_URL }),
    );

    await refreshHubInfo(HUB_ID);
    expect(loadSavedHubs()[0].hub_url).toBe(OLD_URL);
  });

  // A hub that predates this field must not have its address blanked.
  it("leaves the address alone when the hub reports none", async () => {
    connectAt(OLD_URL);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(infoResponse({}));

    await refreshHubInfo(HUB_ID);
    expect(loadSavedHubs()[0].hub_url).toBe(OLD_URL);
  });
});

describe("fetchAllUsers against a hub without list.cursor", () => {
  // The failure this gate exists to prevent: a pre-pagination hub ignores
  // `limit` and `cursor` and returns the same full roster to every request,
  // so the paging loop would hand back MAX_PAGES copies of every member.
  it("makes one plain request and returns the roster once", async () => {
    connect([]);
    const roster = [{ public_key: "a" }, { public_key: "b" }];
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(roster), { status: 200 }));

    const users = await fetchAllUsers();

    expect(users).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${HUB_URL}/users`);
  });

  it("pages when the hub advertises list.cursor", async () => {
    connect(["list.cursor"]);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify([{ public_key: "a" }]), { status: 200 }));

    await fetchAllUsers();

    // One short page ends the walk, but the request carries the paging params
    // — that is the difference from the branch above.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("limit=500");
  });

  // "We never asked" is not "the hub said no". A hub saved by a build older
  // than capability advertising reports unknown, and guessing "old" about a
  // modern hub would silently keep only its first page of members.
  it("pages when capabilities are unknown, rather than guessing old", async () => {
    connect(undefined);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify([{ public_key: "a" }]), { status: 200 }));

    await fetchAllUsers();

    expect(String(fetchMock.mock.calls[0][0])).toContain("limit=500");
  });

  // ...and if that unknown hub does turn out to be old, it ignores the cursor
  // and answers with the same full page forever. The keyset uses a strict `>`,
  // so a page ending on the key we just sent can only mean that.
  it("stops when the hub is not advancing the cursor", async () => {
    connect(undefined);
    const page = Array.from({ length: 500 }, (_, i) => ({ public_key: `k${i}` }));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(JSON.stringify(page), { status: 200 }));

    const users = await fetchAllUsers();

    // Two requests: the first page, then the one that proves the cursor is
    // being ignored. Not 40, and not 40 × 500 duplicated members.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(users).toHaveLength(500);
  });
});
