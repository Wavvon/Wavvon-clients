import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));

const storage: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage[k] ?? null,
  setItem: (k: string, v: string) => { storage[k] = v; },
  removeItem: (k: string) => { delete storage[k]; },
});

import { buildFullArchiveActions } from "./fullArchiveActions";

const skin = (name: string) => ({ format: "wavvon.skin", version: 1, name, base: "dark", tokens: {} });

function opened(existingSkin: unknown) {
  return {
    account_id: "acct-1",
    was_first_account: false,
    existing: { hub_list: [{ hub_id: "kept", hub_name: "Kept", hub_url: "https://kept" }], ignored_users: [], voice_gains: {}, skin: existingSkin },
    archive: {
      version: 1,
      kind: "full-archive",
      exported_at: 0,
      home_hubs: { designations: [] },
      devices: { subkey_certs: [], revocations: [] },
      prefs: {
        hub_list: [{ hub_id: "new", hub_name: "New", hub_url: "https://new" }],
        theme: "dark",
        ignored_users: ["peer"],
        voice_gains: { peer: 150 },
        mention_ping_enabled: false,
        hub_synced: null,
        gap_note: null,
      },
      dms: [],
      themes: [skin("A"), skin("B")],
      drafts: { "hub/chan": "from archive", "hub/other": "also" },
    },
  };
}

describe("desktop full-archive restore", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    for (const k of Object.keys(storage)) delete storage[k];
  });

  it("hands Rust the merged stores and keeps device-wide drafts and mention ping here", async () => {
    storage["wavvon.drafts"] = JSON.stringify({ "hub/chan": "local wins" });
    invokeMock.mockImplementation((cmd: string) => Promise.resolve(cmd === "open_full_archive" ? opened(null) : undefined));

    const result = await buildFullArchiveActions("Wavvon archive", "cooldown").restoreArchive("C:/a.json.enc", "pw");

    expect(invokeMock).toHaveBeenCalledWith("apply_full_archive_restore", {
      accountId: "acct-1",
      stores: {
        hub_list: [
          { hub_id: "kept", hub_name: "Kept", hub_url: "https://kept" },
          { hub_id: "new", hub_name: "New", hub_url: "https://new" },
        ],
        ignored_users: ["peer"],
        voice_gains: { peer: 150 },
        skin: skin("A"),
      },
    });
    expect(JSON.parse(storage["wavvon.drafts"])).toEqual({ "hub/chan": "local wins", "hub/other": "also" });
    expect(storage["wavvon.mentionPing"]).toBe("0");
    // One theme slot per account: A lands, B is reported as skipped.
    expect(result.summary.themesRestored).toBe(1);
    expect(result.summary.themesSkipped).toBe(1);
  });

  it("never replaces a custom theme the account already has", async () => {
    invokeMock.mockImplementation((cmd: string) => Promise.resolve(cmd === "open_full_archive" ? opened(skin("Mine")) : undefined));

    const result = await buildFullArchiveActions("Wavvon archive", "cooldown").restoreArchive("C:/a.json.enc", "pw");

    const apply = invokeMock.mock.calls.find(([cmd]) => cmd === "apply_full_archive_restore");
    expect(apply?.[1].stores.skin).toBeNull();
    expect(result.summary.themesRestored).toBe(0);
    expect(result.summary.themesSkipped).toBe(2);
  });
});
