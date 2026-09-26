import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SubkeyCert } from "@shared/types";
import { masterPublicKeyHex } from "@wavvon/core";
import { setSession, setActiveHubId, resetHubSessions } from "../session";
import { ensureHomeHubDesignation, ensureSelfDeviceCert } from "../commands/identity";

const HUB_URL = "https://hub.example";
const HUB_ID = "hub-pub-key";
const SEED = "11".repeat(32);
const OTHER_SEED = "22".repeat(32);

// A cert this device could have signed itself: it names the very master its
// own seed derives. What a device gets at first auth.
const selfCert = (seed: string) => ({ master_pubkey: masterPublicKeyHex(seed) }) as SubkeyCert;
// A cert handed over by the pairing device: it names a master this device's
// seed cannot derive.
const pairedCert = () => ({ master_pubkey: masterPublicKeyHex(OTHER_SEED) }) as SubkeyCert;

const saved: unknown[] = [];
vi.mock("@identity/index", async () => {
  const actual = await vi.importActual<typeof import("@identity/index")>("@identity/index");
  return { ...actual, saveIdentity: vi.fn(async (rec: unknown) => { saved.push(rec); }) };
});

beforeEach(() => {
  saved.length = 0;
  resetHubSessions();
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

describe("ensureHomeHubDesignation", () => {
  it("publishes this hub as slot 0 when the account has no designation", async () => {
    const posted: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") return new Response("Not found", { status: 404 });
      posted.push(JSON.parse(init?.body as string));
      expect(url).toContain("/designation");
      return new Response("{}", { status: 200 });
    }));

    await ensureHomeHubDesignation({ seed_hex: SEED }, `${HUB_URL}/`);

    expect(posted).toHaveLength(1);
    const list = posted[0] as { hubs: string[]; sequence: number; signature: string };
    // Trailing slash stripped: the designation is compared as a string by
    // every consumer, so two spellings of one hub are two hubs.
    expect(list.hubs).toEqual([HUB_URL]);
    expect(list.sequence).toBe(1);
    expect(list.signature).toMatch(/^[0-9a-f]{128}$/);
  });

  it("leaves an existing designation alone, including one the user emptied", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ master_pubkey: "m", hubs: [], issued_at: 1, sequence: 7, signature: "00" }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await ensureHomeHubDesignation({ seed_hex: SEED }, HUB_URL);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing on a paired device — a subkey cannot sign a HomeHubList", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await ensureHomeHubDesignation({ seed_hex: SEED, subkey_cert: pairedCert() }, HUB_URL);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The regression the self-cert-at-first-auth change nearly caused: holding a
  // cert used to mean "paired device", and now every device holds one. If this
  // reverts to a bare `subkey_cert` check, no identity ever publishes a
  // designation again — and nothing else would say so.
  it("still publishes for a device holding a cert it signed itself", async () => {
    const posted: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") return new Response("Not found", { status: 404 });
      posted.push(JSON.parse(init?.body as string));
      return new Response("{}", { status: 200 });
    }));

    await ensureHomeHubDesignation({ seed_hex: SEED, subkey_cert: selfCert(SEED) }, HUB_URL);

    expect(posted).toHaveLength(1);
  });
});

describe("ensureSelfDeviceCert", () => {
  it("issues and registers a master-signed cert for a device that has none", async () => {
    const posted: { url: string; body: SubkeyCert }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      posted.push({ url, body: JSON.parse(init?.body as string) as SubkeyCert });
      return new Response("{}", { status: 200 });
    }));

    await ensureSelfDeviceCert(
      { id: "x", seed_hex: SEED, security_nonce: 0, security_level: 0 },
      `${HUB_URL}/`,
    );

    expect(posted).toHaveLength(1);
    expect(posted[0].url).toContain("/devices");
    const cert = posted[0].body;
    // The link the whole DM fan-out depends on: this cert names the master the
    // home hub list is stored under, and the roster pubkey as its subkey.
    expect(cert.master_pubkey).toBe(masterPublicKeyHex(SEED));
    expect(cert.signature).toMatch(/^[0-9a-f]{128}$/);
    expect(cert.fallback_hubs).toEqual([HUB_URL]);
    // Persisted locally too, or auth would keep presenting nothing.
    expect(saved).toHaveLength(1);
    expect((saved[0] as { subkey_cert?: SubkeyCert }).subkey_cert).toEqual(cert);
  });

  it("does nothing when a cert already exists, paired device included", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await ensureSelfDeviceCert(
      { id: "x", seed_hex: SEED, security_nonce: 0, security_level: 0, subkey_cert: pairedCert() },
      HUB_URL,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
  });
});

// The guard that keeps joining a second hub from resetting the first.
// `ensureHomeHubDesignation` publishes a list naming only the hub it was
// handed, and it is called on every join — so without an "is this the
// identity's first hub" check at the call site, hub B answers 404, gets a
// single-hub list, and now two hubs disagree about where this user lives.
// Sequence cannot break the tie: both are 1.
describe("publishing a designation is a first-hub-only act", () => {
  it("would overwrite the list with a single hub if called on a later join", async () => {
    const posted: { hubs: string[]; sequence: number }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") return new Response("Not found", { status: 404 });
      posted.push(JSON.parse(init?.body as string));
      return new Response("{}", { status: 200 });
    }));

    // A hub that has never seen this identity's designation answers 404
    // whether or not one exists elsewhere, so this call cannot tell.
    await ensureHomeHubDesignation({ seed_hex: SEED }, "https://second.example");

    expect(posted).toHaveLength(1);
    expect(posted[0].hubs).toEqual(["https://second.example"]);
    expect(posted[0].sequence).toBe(1);
  });
});
