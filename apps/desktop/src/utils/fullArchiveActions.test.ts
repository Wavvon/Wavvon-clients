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

const { memoryStore } = vi.hoisted(() => ({ memoryStore: { current: null as unknown } }));
vi.mock("@wavvon/ui", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@wavvon/ui")>();
  memoryStore.current = orig.createMemoryPackageStore();
  return { ...orig, deviceThemeStore: memoryStore.current, deviceLanguageStore: orig.createMemoryPackageStore() };
});

import { bytesToBase64, exportTheme, newTheme, type ThemeStore } from "@wavvon/ui";
import { buildFullArchiveActions } from "./fullArchiveActions";

const theme = (name: string) => ({ name, package_b64: bytesToBase64(exportTheme(newTheme(name, "dark"))) });
const store = () => memoryStore.current as ThemeStore;

function opened() {
  return {
    account_id: "acct-1",
    was_first_account: false,
    existing: { hub_list: [{ hub_id: "kept", hub_name: "Kept", hub_url: "https://kept" }], ignored_users: [], voice_gains: {} },
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
      themes: [theme("A"), theme("B")],
      drafts: { "hub/chan": "from archive", "hub/other": "also" },
    },
  };
}

describe("desktop full-archive restore", () => {
  beforeEach(async () => {
    invokeMock.mockReset();
    for (const k of Object.keys(storage)) delete storage[k];
    for (const t of await store().list()) await store().remove(t.id);
  });

  it("hands Rust the merged stores and keeps device-wide drafts and mention ping here", async () => {
    storage["wavvon.drafts"] = JSON.stringify({ "hub/chan": "local wins" });
    invokeMock.mockImplementation((cmd: string) => Promise.resolve(cmd === "open_full_archive" ? opened() : undefined));

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
      },
    });
    expect(JSON.parse(storage["wavvon.drafts"])).toEqual({ "hub/chan": "local wins", "hub/other": "also" });
    expect(storage["wavvon.mentionPing"]).toBe("0");
    expect(result.summary.themesRestored).toBe(2);
    expect((await store().list()).map((t) => t.manifest.name).sort()).toEqual(["A", "B"]);
  });

  it("never replaces a theme the device already has", async () => {
    await store().put({ id: "x", ...(await import("@wavvon/ui")).loadTheme(exportTheme(newTheme("A", "dark"))) });
    invokeMock.mockImplementation((cmd: string) => Promise.resolve(cmd === "open_full_archive" ? opened() : undefined));

    const result = await buildFullArchiveActions("Wavvon archive", "cooldown").restoreArchive("C:/a.json.enc", "pw");

    expect(result.summary.themesRestored).toBe(1);
    expect(result.summary.themesSkipped).toBe(1);
    expect((await store().list()).map((t) => t.manifest.name).sort()).toEqual(["A", "B"]);
  });
});
