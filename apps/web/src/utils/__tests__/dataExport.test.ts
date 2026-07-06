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
