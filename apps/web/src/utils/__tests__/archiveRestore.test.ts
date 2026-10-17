import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SavedHub } from "@platform";
import { ARCHIVE_KIND, ARCHIVE_DOCUMENT_VERSION, planRestore, type ArchiveDocument, type ExistingAccountSnapshot } from "@wavvon/ui";
import { buildLocalPrefsSnapshot } from "../dataExport";
import { readExistingAccountSnapshot, applyRestorePlan } from "../archiveRestore";
import { newCustomThemeId } from "../customThemes";

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

beforeEach(() => {
  for (const k of Object.keys(localStorageData)) delete localStorageData[k];
});

function makeHub(overrides: Partial<SavedHub> = {}): SavedHub {
  return {
    hub_id: "hub-1",
    hub_name: "Hub One",
    hub_url: "https://hub-one.example",
    hub_icon: null,
    remember_token: false,
    ...overrides,
  };
}

function emptySnapshot(overrides: Partial<ExistingAccountSnapshot> = {}): ExistingAccountSnapshot {
  return {
    hubList: [],
    drafts: {},
    themeNames: [],
    ignoredUsers: [],
    voiceGains: {},
    hasMentionPingSetting: false,
    ...overrides,
  };
}

function makeArchive(overrides: Partial<ArchiveDocument> = {}): ArchiveDocument {
  return {
    version: ARCHIVE_DOCUMENT_VERSION,
    kind: ARCHIVE_KIND,
    exported_at: 1700000000,
    identity: { seed_hex: "aa".repeat(32), security_nonce: 0, security_level: 0 },
    home_hubs: { designations: [] },
    devices: { subkey_certs: [], revocations: [] },
    prefs: {
      hub_list: [],
      theme: "dark",
      ignored_users: [],
      voice_gains: {},
      mention_ping_enabled: true,
      hub_synced: null,
      gap_note: "Hub-synced encrypted preferences are not included.",
    },
    dms: [],
    themes: [],
    drafts: {},
    ...overrides,
  };
}

describe("planRestore — round trip against buildLocalPrefsSnapshot's shape", () => {
  it("restores every field of a freshly-built local prefs snapshot into an empty account", () => {
    const hubs = [makeHub({ hub_id: "a" }), makeHub({ hub_id: "b", hub_name: "Hub Two" })];
    const prefs = buildLocalPrefsSnapshot(() => hubs);
    const archive = makeArchive({ prefs, drafts: { "conv-1": "hello draft" } });

    const plan = planRestore(archive, emptySnapshot(), newCustomThemeId);

    expect(plan.hubList).toEqual(hubs);
    expect(plan.drafts).toEqual({ "conv-1": "hello draft" });
    expect(plan.ignoredUsers).toEqual(prefs.ignored_users);
    expect(plan.voiceGains).toEqual(prefs.voice_gains);
    expect(plan.mentionPingEnabled).toBe(prefs.mention_ping_enabled);
    expect(plan.summary.hubsRestored).toBe(2);
    expect(plan.summary.draftsRestored).toBe(1);
    expect(plan.summary.hubsSkipped).toBe(0);
    // buildLocalPrefsSnapshot's gap_note is null by default (populated only
    // when assembleArchive can't decrypt the hub-synced prefs blob) — no
    // corresponding entry belongs in unrestorable.
    expect(prefs.gap_note).toBeNull();
    expect(plan.summary.unrestorable).toEqual([]);
  });
});

describe("readExistingAccountSnapshot / applyRestorePlan", () => {
  it("writes the plan under the given account id without touching another account's data", () => {
    localStorageData["wavvon:acct:other-account:wavvon:saved_hubs"] = JSON.stringify([makeHub({ hub_id: "untouched" })]);

    const archive = makeArchive({
      prefs: {
        hub_list: [makeHub({ hub_id: "new-hub" })],
        theme: "dark",
        ignored_users: ["peer-x"],
        voice_gains: {},
        mention_ping_enabled: true,
        hub_synced: null,
        gap_note: "gap",
      },
      themes: [{ format: "wavvon.skin", version: 1, name: "Restored", base: "dark", tokens: {} }],
    });

    const existing = readExistingAccountSnapshot("target-account");
    const plan = planRestore(archive, existing, newCustomThemeId);
    applyRestorePlan("target-account", plan);

    const targetHubs = JSON.parse(localStorageData["wavvon:acct:target-account:wavvon:saved_hubs"]);
    expect(targetHubs).toEqual([makeHub({ hub_id: "new-hub" })]);

    const otherHubs = JSON.parse(localStorageData["wavvon:acct:other-account:wavvon:saved_hubs"]);
    expect(otherHubs).toEqual([makeHub({ hub_id: "untouched" })]);

    const targetThemes = JSON.parse(localStorageData["wavvon:acct:target-account:wavvon.customThemes"]);
    expect(targetThemes.themes.map((t: { name: string }) => t.name)).toEqual(["Restored"]);
    expect(localStorageData["wavvon:acct:other-account:wavvon.customThemes"]).toBeUndefined();
  });
});
