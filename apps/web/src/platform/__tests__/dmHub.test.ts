import { describe, it, expect, beforeEach, vi } from "vitest";
import { setSession, setActiveHubId, resetHubSessions } from "../session";
import { dmSession, resetDmHubCache } from "../dmHub";

// Which hub DMs are read from (home-hub.md, "DM delivery").
//
// The bug this decides: a sender's hub walks the recipient's designation, so an
// inbound DM lands on a *home* hub — and a client reading from whichever hub is
// on screen simply never showed it. Delivered, stored, invisible.

const HOME = "home-hub-pubkey";
const OTHER = "other-hub-pubkey";
const HOME_URL = "https://home.example";
const OTHER_URL = "https://other.example";
const MASTER = "aa".repeat(32);

const designation: { hubs: string[] } | null | { throws: true } = { hubs: [] };

vi.mock("../../identity/store", () => ({
  loadIdentity: async () => ({ id: "acct", seed_hex: "11".repeat(32) }),
  masterPubkeyOf: () => MASTER,
}));

vi.mock("../commands/identity", () => ({
  getHomeHubDesignation: async () => {
    if ((designation as { throws?: true }).throws) throw new Error("hub unreachable");
    return designation as { hubs: string[] } | null;
  },
}));

function session(hubId: string, url: string, scope?: "member" | "lobby") {
  setSession(hubId, {
    hub_id: hubId,
    hub_url: url,
    hub_pubkey: hubId,
    hub_name: hubId,
    hub_icon: null,
    token: `token-${hubId}`,
    ws: null,
    ...(scope ? { scope } : {}),
  });
}

beforeEach(() => {
  resetHubSessions();
  session(OTHER, OTHER_URL);
  session(HOME, HOME_URL);
  setActiveHubId(OTHER);
  Object.assign(designation, { hubs: [], throws: undefined });
  // The resolution is cached per account; each case sets up its own world.
  resetDmHubCache();
});



describe("dmSession", () => {
  it("reads from the home hub even while another hub is on screen", async () => {
    Object.assign(designation, { hubs: [HOME_URL] });
    const s = await dmSession();
    expect(s.hub_id).toBe(HOME);
  });

  it("takes the first hub in the list it can actually reach", async () => {
    // Slot 0 is a hub this client does not have open; the list order is a
    // preference, and any entry is authoritative.
    Object.assign(designation, { hubs: ["https://unopened.example", HOME_URL] });
    expect((await dmSession()).hub_id).toBe(HOME);
  });

  it("compares hub URLs the way two spellings of one address should", async () => {
    Object.assign(designation, { hubs: [`${HOME_URL.toUpperCase()}/`] });
    expect((await dmSession()).hub_id).toBe(HOME);
  });

  it("falls back to the active hub with no designation — the old behaviour", async () => {
    Object.assign(designation, { hubs: [] });
    expect((await dmSession()).hub_id).toBe(OTHER);
  });

  it("falls back when the hub that serves the designation cannot be reached", async () => {
    Object.assign(designation, { throws: true });
    expect((await dmSession()).hub_id).toBe(OTHER);
  });

  it("skips a lobby-scoped home hub, which cannot read conversations at all", async () => {
    resetHubSessions();
    session(OTHER, OTHER_URL);
    session(HOME, HOME_URL, "lobby");
    setActiveHubId(OTHER);
    Object.assign(designation, { hubs: [HOME_URL] });
    expect((await dmSession()).hub_id).toBe(OTHER);
  });
});
