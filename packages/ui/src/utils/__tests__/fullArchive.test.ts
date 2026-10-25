import { describe, it, expect } from "vitest";
import {
  ARCHIVE_DOCUMENT_VERSION,
  ARCHIVE_KIND,
  buildDmArchiveConversation,
  parseArchiveDocument,
  planRestore,
  totalRestored,
  totalSkipped,
  type ArchiveDocument,
  type ArchiveHub,
  type ExistingAccountSnapshot,
} from "../fullArchive";

const fixedId = () => "fixed-id";

function makeHub(overrides: Partial<ArchiveHub> = {}): ArchiveHub {
  return { hub_id: "hub-1", hub_name: "Hub One", hub_url: "https://hub-one.example", ...overrides };
}

function emptySnapshot(overrides: Partial<ExistingAccountSnapshot> = {}): ExistingAccountSnapshot {
  return { hubList: [], drafts: {}, themeNames: [], ignoredUsers: [], voiceGains: {}, hasMentionPingSetting: false, ...overrides };
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
      gap_note: null,
    },
    dms: [],
    themes: [],
    drafts: {},
    ...overrides,
  };
}

function without(key: string): string {
  const bad = JSON.parse(JSON.stringify(makeArchive())) as Record<string, unknown>;
  delete bad[key];
  return JSON.stringify(bad);
}

describe("parseArchiveDocument", () => {
  it("accepts a well-formed archive", () => {
    const archive = makeArchive();
    expect(parseArchiveDocument(JSON.stringify(archive)).identity.seed_hex).toBe(archive.identity.seed_hex);
  });

  it("names what is wrong with a file it refuses", () => {
    expect(() => parseArchiveDocument("{not json")).toThrow("malformed_archive");
    expect(() => parseArchiveDocument(JSON.stringify({ kind: "identity-backup", version: 1 }))).toThrow("unsupported_archive_format");
    expect(() => parseArchiveDocument(JSON.stringify(makeArchive({ version: ARCHIVE_DOCUMENT_VERSION + 1 })))).toThrow("archive_too_new");
    for (const key of ["identity", "dms", "prefs", "themes", "drafts"]) {
      expect(() => parseArchiveDocument(without(key))).toThrow("malformed_archive");
    }
  });
});

describe("planRestore", () => {
  it("restores everything into an empty account", () => {
    const hubs = [makeHub({ hub_id: "a" }), makeHub({ hub_id: "b" })];
    const archive = makeArchive({
      prefs: { ...makeArchive().prefs, hub_list: hubs, ignored_users: ["x"], voice_gains: { x: 50 }, mention_ping_enabled: false },
      drafts: { "conv-1": "hello draft" },
    });
    const plan = planRestore(archive, emptySnapshot(), fixedId);
    expect(plan.hubList).toEqual(hubs);
    expect(plan.drafts).toEqual({ "conv-1": "hello draft" });
    expect(plan.ignoredUsers).toEqual(["x"]);
    expect(plan.voiceGains).toEqual({ x: 50 });
    expect(plan.mentionPingEnabled).toBe(false);
    expect(totalRestored(plan.summary)).toBe(6);
    expect(plan.summary.unrestorable).toEqual([]);
  });

  it("skips hubs, drafts, ignored users and gains already present, keeping the local copy", () => {
    const archive = makeArchive({
      prefs: {
        ...makeArchive().prefs,
        hub_list: [makeHub({ hub_id: "shared", hub_name: "Archive name" })],
        ignored_users: ["peer-1"],
        voice_gains: { "peer-1": 50 },
        mention_ping_enabled: false,
      },
      drafts: { "conv-1": "from archive" },
    });
    const existing = emptySnapshot({
      hubList: [makeHub({ hub_id: "shared", hub_name: "Local name (kept)" })],
      drafts: { "conv-1": "local draft (kept)" },
      ignoredUsers: ["peer-1"],
      voiceGains: { "peer-1": 90 },
      hasMentionPingSetting: true,
    });

    const plan = planRestore(archive, existing, fixedId);

    expect(plan.hubList).toEqual(existing.hubList);
    expect(plan.drafts["conv-1"]).toBe("local draft (kept)");
    expect(plan.voiceGains["peer-1"]).toBe(90);
    expect(plan.mentionPingEnabled).toBeNull();
    expect(totalRestored(plan.summary)).toBe(0);
    expect(totalSkipped(plan.summary)).toBe(5);
  });

  it("skips a custom theme whose name already exists and restores the rest", () => {
    const archive = makeArchive({
      themes: [
        { format: "wavvon.skin", version: 1, name: "Existing", base: "dark", tokens: {} },
        { format: "wavvon.skin", version: 1, name: "New Theme", base: "dark", tokens: {} },
      ],
    });
    const plan = planRestore(archive, emptySnapshot({ themeNames: ["Existing"] }), fixedId);
    expect(plan.summary.themesSkipped).toBe(1);
    expect(plan.newThemes).toEqual([{ id: "fixed-id", name: "New Theme", skin: archive.themes[1] }]);
  });

  it("reports what it cannot write instead of dropping it", () => {
    const archive = makeArchive({
      prefs: { ...makeArchive().prefs, gap_note: "paired device" },
      dms: [{ peer_pubkey: "peer-1", conv_type: "dm", messages: [{ sent_at: 1, direction: "in", body: "hi" }] }],
      home_hubs: { designations: [{} as ArchiveDocument["home_hubs"]["designations"][number]] },
    });
    expect(planRestore(archive, emptySnapshot(), fixedId).summary.unrestorable).toEqual([
      { kind: "prefs_gap" },
      { kind: "dm_history", conversations: 1, messages: 1 },
      { kind: "hub_records" },
    ]);
  });
});

describe("buildDmArchiveConversation", () => {
  it("groups messages under the other members and marks direction", () => {
    const result = buildDmArchiveConversation(
      { conv_type: "group", members: ["me", "a", "b"] },
      [
        { sender: "a", content: "hey", created_at: 1 },
        { sender: "me", content: "hey back", created_at: 2 },
      ],
      "me",
    );
    expect(result).toEqual({
      peer_pubkey: "a,b",
      conv_type: "group",
      messages: [
        { sent_at: 1, direction: "in", body: "hey" },
        { sent_at: 2, direction: "out", body: "hey back" },
      ],
    });
  });
});
