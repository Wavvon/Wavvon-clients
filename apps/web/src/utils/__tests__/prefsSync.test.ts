import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  masterPublicKeyHex,
  masterSeedHex,
  derivePrefsBlobKey,
  encryptPrefsBlob,
  decryptPrefsBlob,
  buildPrefsBlob,
  type PrefsBlobContents,
  type SavedSticker,
  type SignedPrefsBlob,
} from "@wavvon/core";

const loadIdentity = vi.fn();
const getHomeHubDesignation = vi.fn();
const getBlob = vi.fn();
const putBlob = vi.fn();

vi.mock("../../identity/store", async (orig) => ({
  ...(await orig<typeof import("../../identity/store")>()),
  loadIdentity: () => loadIdentity(),
}));
vi.mock("../../platform/commands/identity", () => ({
  getHomeHubDesignation: (pk: string) => getHomeHubDesignation(pk),
  getPrefsBlobFrom: (url: string, pk: string) => getBlob(url, pk),
  putPrefsBlobTo: (url: string, blob: SignedPrefsBlob) => putBlob(url, blob),
}));
vi.mock("../../platform/session", () => ({
  allSessions: () => [],
  getActiveHubId: () => null,
  getSession: () => null,
}));

const { startPrefsSync } = await import("../prefsSync");

const seed = "11".repeat(32);
const cert = (master: string) => ({ master_pubkey: master }) as never;

const master = masterPublicKeyHex(seed);
const masterSeed = masterSeedHex(seed);
const key = derivePrefsBlobKey(masterSeed);

function sticker(n: string): SavedSticker {
  return { sha256: n.repeat(64).slice(0, 64), name: n, origin_hub_url: "https://a.example", origin_hub_name: "A", saved_at: 1 };
}

function blobOf(version: number, contents: PrefsBlobContents): SignedPrefsBlob {
  return buildPrefsBlob(masterSeed, master, version, encryptPrefsBlob(contents, key));
}

// A one-hub store with the hub's own rule: a write must beat the stored version.
function fakeHub(initial: SignedPrefsBlob | null) {
  let stored = initial;
  getBlob.mockImplementation(async () => stored);
  putBlob.mockImplementation(async (_url: string, blob: SignedPrefsBlob) => {
    if (stored && blob.blob_version <= stored.blob_version) throw new Error("409");
    stored = blob;
  });
  return {
    contents: () => decryptPrefsBlob(stored!.ciphertext_hex, key),
    writeFromAnotherDevice: (c: PrefsBlobContents) => { stored = blobOf((stored?.blob_version ?? 0) + 1, c); },
  };
}

beforeEach(() => {
  loadIdentity.mockReset();
  getHomeHubDesignation.mockReset().mockResolvedValue(null);
  getBlob.mockReset();
  putBlob.mockReset();
});

describe("startPrefsSync", () => {
  it("syncs on the device that self-certified, since it still holds the master seed", async () => {
    loadIdentity.mockResolvedValue({ seed_hex: seed, subkey_cert: cert(masterPublicKeyHex(seed)) });
    await startPrefsSync(() => {});
    expect(getHomeHubDesignation).toHaveBeenCalled();
  });

  it("does not sync on a paired device, whose cert names a master its seed cannot derive", async () => {
    loadIdentity.mockResolvedValue({ seed_hex: seed, subkey_cert: cert("ab".repeat(32)) });
    expect(await startPrefsSync(() => {})).toBeNull();
    expect(getHomeHubDesignation).not.toHaveBeenCalled();
  });
});

describe("sticker collection", () => {
  async function start(hubs: string[]) {
    loadIdentity.mockResolvedValue({ seed_hex: seed, subkey_cert: cert(master) });
    getHomeHubDesignation.mockResolvedValue({ hubs });
    const handle = await startPrefsSync(() => {});
    handle!.stop();
    return handle!;
  }

  it("adds to the collection and keeps every other field of the blob", async () => {
    const hub = fakeHub(blobOf(3, {
      blocked_users: ["u1"],
      voice_settings: { vad_threshold: 0.05 },
      stickers: [sticker("a")],
    }));
    const handle = await start(["https://home.example"]);
    expect(handle.stickers.get()).toEqual([sticker("a")]);

    await handle.stickers.mutate((l) => [...l, sticker("b")]);

    const after = hub.contents();
    expect(after.stickers).toEqual([sticker("a"), sticker("b")]);
    expect(after.blocked_users).toEqual(["u1"]);
    expect(after.voice_settings).toEqual({ vad_threshold: 0.05 });
  });

  it("merges into a collection another device changed meanwhile instead of erasing it", async () => {
    const hub = fakeHub(blobOf(1, { blocked_users: [], voice_settings: {}, stickers: [sticker("a")] }));
    const handle = await start(["https://home.example"]);

    hub.writeFromAnotherDevice({ blocked_users: [], voice_settings: {}, stickers: [sticker("a"), sticker("c")] });
    await handle.stickers.mutate((l) => [...l, sticker("b")]);

    expect(hub.contents().stickers).toEqual([sticker("a"), sticker("c"), sticker("b")]);
  });

  it("reports a failed save instead of pretending it landed", async () => {
    fakeHub(blobOf(1, { blocked_users: [], voice_settings: {} }));
    const handle = await start(["https://home.example"]);
    putBlob.mockRejectedValue(new Error("down"));
    await expect(handle.stickers.mutate((l) => [...l, sticker("b")])).rejects.toThrow();
  });
});
