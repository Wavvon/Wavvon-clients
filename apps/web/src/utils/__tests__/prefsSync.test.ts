import { describe, it, expect, vi, beforeEach } from "vitest";
import { masterPublicKeyHex } from "@wavvon/core";

const loadIdentity = vi.fn();
const getHomeHubDesignation = vi.fn();

vi.mock("../../identity/store", async (orig) => ({
  ...(await orig<typeof import("../../identity/store")>()),
  loadIdentity: () => loadIdentity(),
}));
vi.mock("../../platform/commands/identity", () => ({
  getHomeHubDesignation: (pk: string) => getHomeHubDesignation(pk),
  getPrefsBlobFrom: vi.fn(),
  putPrefsBlobTo: vi.fn(),
}));
vi.mock("../../platform/session", () => ({
  allSessions: () => [],
  getActiveHubId: () => null,
  getSession: () => null,
}));

const { startPrefsSync } = await import("../prefsSync");

const seed = "11".repeat(32);
const cert = (master: string) => ({ master_pubkey: master }) as never;

beforeEach(() => {
  loadIdentity.mockReset();
  getHomeHubDesignation.mockReset().mockResolvedValue(null);
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
