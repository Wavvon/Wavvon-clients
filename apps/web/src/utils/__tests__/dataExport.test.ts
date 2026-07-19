import { describe, it, expect, vi } from "vitest";
import type { Conversation, DmMessageFull } from "../../types";
import { buildDmArchiveConversation, assembleArchive, type ArchiveFetchers } from "../dataExport";

const localStorageData: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => localStorageData[k] ?? null,
  setItem: (k: string, v: string) => { localStorageData[k] = v; },
  removeItem: (k: string) => { delete localStorageData[k]; },
});

const MY_PUBKEY = "me-pubkey";
const PEER_PUBKEY = "peer-pubkey";
const FAKE_SEED_HEX = "aa".repeat(32);

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv-1",
    conv_type: "dm",
    members: [MY_PUBKEY, PEER_PUBKEY],
    created_at: 1000,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<DmMessageFull> = {}): DmMessageFull {
  return {
    id: "m1",
    conversation_id: "conv-1",
    sender: PEER_PUBKEY,
    sender_name: null,
    content: "hi",
    created_at: 1234,
    ...overrides,
  };
}

function makeFetchers(overrides: Partial<ArchiveFetchers> = {}): ArchiveFetchers {
  return {
    loadIdentity: () => Promise.resolve({ seed_hex: FAKE_SEED_HEX, security_nonce: 0, security_level: 0 }),
    getHomeHubDesignation: () => Promise.resolve(null),
    listDeviceCerts: () => Promise.resolve([]),
    listDeviceRevocations: () => Promise.resolve([]),
    getPrefsBlob: () => Promise.resolve(null),
    listConversations: () => Promise.resolve([]),
    getDmMessages: () => Promise.resolve([]),
    loadSavedHubs: () => [],
    ...overrides,
  };
}

describe("buildDmArchiveConversation", () => {
  it("groups messages under the other member as peer_pubkey", () => {
    const conv = makeConversation();
    const messages = [
      makeMessage({ sender: PEER_PUBKEY, content: "hey", created_at: 1 }),
      makeMessage({ sender: MY_PUBKEY, content: "hey back", created_at: 2 }),
    ];

    const result = buildDmArchiveConversation(conv, messages, MY_PUBKEY);

    expect(result.peer_pubkey).toBe(PEER_PUBKEY);
    expect(result.conv_type).toBe("dm");
    expect(result.messages).toEqual([
      { sent_at: 1, direction: "in", body: "hey" },
      { sent_at: 2, direction: "out", body: "hey back" },
    ]);
  });

  it("joins multiple non-self members for group conversations", () => {
    const conv = makeConversation({ conv_type: "group", members: [MY_PUBKEY, "a", "b"] });
    const result = buildDmArchiveConversation(conv, [], MY_PUBKEY);
    expect(result.peer_pubkey).toBe("a,b");
  });
});

describe("assembleArchive", () => {
  it("collects all conversations and reports progress", async () => {
    const conv1 = makeConversation({ id: "c1" });
    const conv2 = makeConversation({ id: "c2", members: [MY_PUBKEY, "other-peer"] });
    const getDmMessages = vi.fn((conversationId: string) =>
      Promise.resolve([makeMessage({ conversation_id: conversationId, sender: MY_PUBKEY, content: `body-${conversationId}` })]),
    );
    const onProgress = vi.fn();

    const doc = await assembleArchive(
      { onProgress },
      makeFetchers({
        listConversations: () => Promise.resolve([conv1, conv2]),
        getDmMessages,
      }),
    );

    expect(doc.version).toBe(1);
    expect(doc.kind).toBe("full-archive");
    expect(doc.dms).toHaveLength(2);
    expect(doc.dms[0].messages[0].body).toBe("body-c1");
    expect(doc.dms[1].messages[0].body).toBe("body-c2");
    expect(onProgress).toHaveBeenCalledWith(0, 2);
    expect(onProgress).toHaveBeenCalledWith(2, 2);
  });

  it("aborts without producing a partial archive when a conversation fetch fails", async () => {
    const conv1 = makeConversation({ id: "c1" });
    const conv2 = makeConversation({ id: "c2" });
    const getDmMessages = vi.fn((conversationId: string) => {
      if (conversationId === "c2") return Promise.reject(new Error("network down"));
      return Promise.resolve([]);
    });

    await expect(
      assembleArchive(
        {},
        makeFetchers({
          listConversations: () => Promise.resolve([conv1, conv2]),
          getDmMessages,
        }),
      ),
    ).rejects.toThrow("network down");
  });

  it("aborts when it has no identity to export", async () => {
    await expect(
      assembleArchive({}, makeFetchers({ loadIdentity: () => Promise.resolve(null) })),
    ).rejects.toThrow();
  });

  it("aborts when the device-cert fetch fails, before touching conversations", async () => {
    const listConversations = vi.fn(() => Promise.resolve([]));
    await expect(
      assembleArchive(
        {},
        makeFetchers({
          listDeviceCerts: () => Promise.reject(new Error("hub unreachable")),
          listConversations,
        }),
      ),
    ).rejects.toThrow("hub unreachable");
    expect(listConversations).not.toHaveBeenCalled();
  });
});

describe("assembleArchive — prefs-blob decrypt", () => {
  // Same entropy (0x01..0x20) as packages/core's master.test.ts / wire.test.ts
  // vectors, generated against wavvon_identity::MasterIdentity/SignedPrefsBlob
  // directly (see packages/core commit for the generating Rust snippet).
  const ENTROPY_HEX = Array.from({ length: 32 }, (_, i) => (i + 1).toString(16).padStart(2, "0")).join("");
  const MASTER_FROM_ENTROPY_PUB = "8fbafd0f662f225430eed18b132b3de956dc7d75c95b26baa97ada69aab51565";
  const BLOB_CIPHERTEXT_HEX =
    "00000000000000000000000065338dfb57de69d2d7dee5cbd93fefba9e93f9e4f966cf6909f30bd96b29b6ee9b597cc02040ccfab8729f3cc8a3d906c91007fb07cbbf2660413dfc7256156cf27e73b271f16acf6b8ce6472e28141800ecdc62";
  const BLOB_SIG =
    "bcc7e3235c6e78c174b9e7f8797303d633c2e20376333dd9eee321fc783ed860fe624598817f0d2c897d51d30c57d6e57c7e454814852aba939a93380b6e5e07";

  it("decrypts and includes the hub-synced prefs for an entropy-holding identity", async () => {
    const doc = await assembleArchive(
      {},
      makeFetchers({
        loadIdentity: () => Promise.resolve({ seed_hex: ENTROPY_HEX, security_nonce: 0, security_level: 0 }),
        getPrefsBlob: (masterPubkey: string) => {
          expect(masterPubkey).toBe(MASTER_FROM_ENTROPY_PUB);
          return Promise.resolve({
            master_pubkey: MASTER_FROM_ENTROPY_PUB,
            blob_version: 3,
            ciphertext_hex: BLOB_CIPHERTEXT_HEX,
            signature: BLOB_SIG,
          });
        },
      }),
    );

    expect(doc.prefs.hub_synced).toEqual({
      blocked_users: ["abc123"],
      voice_settings: { vad_threshold: 0.05 },
    });
    expect(doc.prefs.gap_note).toBeNull();
  });

  it("rejects a prefs blob with a bad signature rather than silently omitting it", async () => {
    await expect(
      assembleArchive(
        {},
        makeFetchers({
          loadIdentity: () => Promise.resolve({ seed_hex: ENTROPY_HEX, security_nonce: 0, security_level: 0 }),
          getPrefsBlob: () =>
            Promise.resolve({
              master_pubkey: MASTER_FROM_ENTROPY_PUB,
              blob_version: 4, // signature above was made over blob_version 3
              ciphertext_hex: BLOB_CIPHERTEXT_HEX,
              signature: BLOB_SIG,
            }),
        }),
      ),
    ).rejects.toThrow(/signature/i);
  });

  it("leaves hub_synced and gap_note null when nothing has been published yet", async () => {
    const doc = await assembleArchive({}, makeFetchers());
    expect(doc.prefs.hub_synced).toBeNull();
    expect(doc.prefs.gap_note).toBeNull();
  });

  it("skips decrypt for a paired device, which holds no local entropy", async () => {
    const getPrefsBlob = vi.fn(() => Promise.resolve(null));
    const doc = await assembleArchive(
      {},
      makeFetchers({
        loadIdentity: () =>
          Promise.resolve({
            seed_hex: FAKE_SEED_HEX,
            security_nonce: 0,
            security_level: 0,
            master_pubkey: "some-master-pubkey",
            subkey_cert: {},
          }),
        getPrefsBlob,
      }),
    );
    expect(getPrefsBlob).not.toHaveBeenCalled();
    expect(doc.prefs.hub_synced).toBeNull();
    expect(doc.prefs.gap_note).toMatch(/paired device/i);
  });
});
