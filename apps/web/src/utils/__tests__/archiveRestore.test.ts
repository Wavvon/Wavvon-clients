import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SavedHub } from "@platform";
import type { ArchiveDocument } from "../dataExport";
import { ARCHIVE_KIND, ARCHIVE_DOCUMENT_VERSION, buildLocalPrefsSnapshot } from "../dataExport";
import {
  parseArchiveDocument,
  planRestore,
  readExistingAccountSnapshot,
  applyRestorePlan,
  totalRestored,
  totalSkipped,
  type ExistingAccountSnapshot,
} from "../archiveRestore";

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
      theme: "calm",
      ignored_users: [],
      voice_gains: {},
      mention_ping_enabled: true,
      gap_note: "Hub-synced encrypted preferences are not included.",
    },
    dms: [],
    themes: [],
    drafts: {},
    ...overrides,
  };
}

describe("parseArchiveDocument", () => {
  it("accepts a well-formed archive", () => {
    const archive = makeArchive();
    const parsed = parseArchiveDocument(JSON.stringify(archive));
    expect(parsed.kind).toBe(ARCHIVE_KIND);
    expect(parsed.identity.seed_hex).toBe(archive.identity.seed_hex);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseArchiveDocument("{not json")).toThrow();
  });

  it("rejects a file that isn't a full-archive", () => {
    expect(() => parseArchiveDocument(JSON.stringify({ kind: "identity-backup", version: 1 }))).toThrow();
  });

  it("rejects an archive from a newer version", () => {
    const archive = makeArchive({ version: ARCHIVE_DOCUMENT_VERSION + 1 });
    expect(() => parseArchiveDocument(JSON.stringify(archive))).toThrow();
  });

  it("rejects an archive missing identity", () => {
    const archive = makeArchive();
    const bad = JSON.parse(JSON.stringify(archive)) as Record<string, unknown>;
    delete bad.identity;
    expect(() => parseArchiveDocument(JSON.stringify(bad))).toThrow();
  });

  it("rejects an archive missing the dms section", () => {
    const archive = makeArchive();
    const bad = JSON.parse(JSON.stringify(archive)) as Record<string, unknown>;
    delete bad.dms;
    expect(() => parseArchiveDocument(JSON.stringify(bad))).toThrow();
  });

  it("rejects an archive missing the prefs section", () => {
    const archive = makeArchive();
    const bad = JSON.parse(JSON.stringify(archive)) as Record<string, unknown>;
    delete bad.prefs;
    expect(() => parseArchiveDocument(JSON.stringify(bad))).toThrow();
  });
});

describe("planRestore — round trip against buildLocalPrefsSnapshot's shape", () => {
  it("restores every field of a freshly-built local prefs snapshot into an empty account", () => {
    const hubs = [makeHub({ hub_id: "a" }), makeHub({ hub_id: "b", hub_name: "Hub Two" })];
    const prefs = buildLocalPrefsSnapshot(() => hubs);
    const archive = makeArchive({ prefs, drafts: { "conv-1": "hello draft" } });

    const plan = planRestore(archive, emptySnapshot());

    expect(plan.hubList).toEqual(hubs);
    expect(plan.drafts).toEqual({ "conv-1": "hello draft" });
    expect(plan.ignoredUsers).toEqual(prefs.ignored_users);
    expect(plan.voiceGains).toEqual(prefs.voice_gains);
    expect(plan.mentionPingEnabled).toBe(prefs.mention_ping_enabled);
    expect(plan.summary.hubsRestored).toBe(2);
    expect(plan.summary.draftsRestored).toBe(1);
    expect(plan.summary.hubsSkipped).toBe(0);
    expect(plan.summary.unrestorable).toContain(prefs.gap_note);
  });
});

describe("planRestore — conflict policy", () => {
  it("skips hubs, drafts, and ignored users already present locally, keeping the local copy", () => {
    const archive = makeArchive({
      prefs: {
        hub_list: [makeHub({ hub_id: "shared", hub_name: "Archive name" })],
        theme: "calm",
        ignored_users: ["peer-1"],
        voice_gains: { "hub-1": 0.5 },
        mention_ping_enabled: false,
        gap_note: "gap",
      },
      drafts: { "conv-1": "from archive" },
    });

    const existing = emptySnapshot({
      hubList: [makeHub({ hub_id: "shared", hub_name: "Local name (kept)" })],
      drafts: { "conv-1": "local draft (kept)" },
      ignoredUsers: ["peer-1"],
      voiceGains: { "hub-1": 0.9 },
      hasMentionPingSetting: true,
    });

    const plan = planRestore(archive, existing);

    expect(plan.hubList).toEqual([makeHub({ hub_id: "shared", hub_name: "Local name (kept)" })]);
    expect(plan.drafts["conv-1"]).toBe("local draft (kept)");
    expect(plan.voiceGains["hub-1"]).toBe(0.9);
    expect(plan.mentionPingEnabled).toBeNull();

    expect(plan.summary.hubsSkipped).toBe(1);
    expect(plan.summary.hubsRestored).toBe(0);
    expect(plan.summary.draftsSkipped).toBe(1);
    expect(plan.summary.draftsRestored).toBe(0);
    expect(plan.summary.ignoredUsersSkipped).toBe(1);
    expect(plan.summary.voiceGainsSkipped).toBe(1);
    expect(plan.summary.mentionPingRestored).toBe(false);
    expect(plan.summary.mentionPingSkipped).toBe(true);

    expect(totalRestored(plan.summary)).toBe(0);
    expect(totalSkipped(plan.summary)).toBe(5);
  });

  it("skips a custom theme whose name already exists and restores the rest", () => {
    const archive = makeArchive({
      themes: [
        { format: "wavvon.skin", version: 1, name: "Existing", base: "calm", tokens: {} },
        { format: "wavvon.skin", version: 1, name: "New Theme", base: "calm", tokens: {} },
      ],
    });
    const existing = emptySnapshot({ themeNames: ["Existing"] });

    const plan = planRestore(archive, existing, { idFactory: () => "fixed-id" });

    expect(plan.summary.themesSkipped).toBe(1);
    expect(plan.summary.themesRestored).toBe(1);
    expect(plan.newThemes).toEqual([{ id: "fixed-id", name: "New Theme", skin: archive.themes[1] }]);
  });

  it("reports DM history as present but not restored", () => {
    const archive = makeArchive({
      dms: [
        {
          peer_pubkey: "peer-1",
          conv_type: "dm",
          messages: [{ sent_at: 1, direction: "in", body: "hi" }],
        },
      ],
    });

    const plan = planRestore(archive, emptySnapshot());

    expect(plan.summary.dmConversations).toBe(1);
    expect(plan.summary.dmMessages).toBe(1);
    expect(plan.summary.unrestorable.some((n) => n.includes("DM history"))).toBe(true);
  });
});

describe("readExistingAccountSnapshot / applyRestorePlan", () => {
  it("writes the plan under the given account id without touching another account's data", () => {
    localStorageData["wavvon:acct:other-account:wavvon:saved_hubs"] = JSON.stringify([makeHub({ hub_id: "untouched" })]);

    const archive = makeArchive({
      prefs: {
        hub_list: [makeHub({ hub_id: "new-hub" })],
        theme: "calm",
        ignored_users: ["peer-x"],
        voice_gains: {},
        mention_ping_enabled: true,
        gap_note: "gap",
      },
    });

    const existing = readExistingAccountSnapshot("target-account");
    const plan = planRestore(archive, existing);
    applyRestorePlan("target-account", plan);

    const targetHubs = JSON.parse(localStorageData["wavvon:acct:target-account:wavvon:saved_hubs"]);
    expect(targetHubs).toEqual([makeHub({ hub_id: "new-hub" })]);

    const otherHubs = JSON.parse(localStorageData["wavvon:acct:other-account:wavvon:saved_hubs"]);
    expect(otherHubs).toEqual([makeHub({ hub_id: "untouched" })]);
  });
});
