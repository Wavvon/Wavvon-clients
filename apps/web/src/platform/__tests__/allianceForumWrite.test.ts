import { describe, it, expect, beforeEach, vi } from "vitest";
import { setSession, setActiveHubId, resetHubSessions } from "../session";
import {
  createAllianceChannelPost,
  createAllianceChannelReply,
  reactAllianceChannelPost,
  allianceForumWriteErrorCode,
} from "../commands/forum";
import { HubApiError } from "../http";

// Forum federation write proxy (forum federation phase 2): a shared forum
// channel's requester-side write endpoints -- POST .../posts,
// .../posts/:id/replies, .../posts/:id/reactions -- either delegate to the
// caller's own hub (locally-owned channel) or proxy to the owning peer,
// gated there by that channel's forum_remote_write policy. These tests pin
// down the alliance-scoped write URLs/bodies and the 403 error-code mapping
// surfaced to the UI when the policy rejects a write.

const HUB_URL = "https://hub.example";
const HUB_ID = "hub-pub-key";

beforeEach(() => {
  resetHubSessions();
  setSession(HUB_ID, {
    hub_id: HUB_ID,
    hub_url: HUB_URL,
    hub_pubkey: HUB_ID,
    hub_name: "Hub",
    hub_icon: null,
    token: "tok",
    ws: null,
  });
  setActiveHubId(HUB_ID);
});

describe("createAllianceChannelPost", () => {
  it("posts title/body to the alliance-scoped posts route", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${HUB_URL}/alliances/all-1/channels/chan-1/posts`);
      expect(init?.method).toBe("POST");
      expect(JSON.parse(init!.body as string)).toEqual({ title: "Hello", body: "World" });
      return new Response(JSON.stringify({ id: "post-1" }), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await createAllianceChannelPost("all-1", "chan-1", "Hello", "World");
    expect(res).toEqual({ id: "post-1" });
  });

  it("surfaces a policy-rejection 403 as a HubApiError carrying the code", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("forum_remote_write_disabled", { status: 403 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(createAllianceChannelPost("all-1", "chan-1", "Hello", "World")).rejects.toMatchObject({
      status: 403,
      message: "forum_remote_write_disabled",
    });
  });
});

describe("createAllianceChannelReply", () => {
  it("posts body/reply_to_id to the alliance-scoped replies route", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${HUB_URL}/alliances/all-1/channels/chan-1/posts/post-1/replies`);
      expect(JSON.parse(init!.body as string)).toEqual({ body: "hi", reply_to_id: "reply-0" });
      return new Response(JSON.stringify({ id: "reply-1" }), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await createAllianceChannelReply("all-1", "chan-1", "post-1", "hi", "reply-0");
    expect(res).toEqual({ id: "reply-1" });
  });
});

describe("reactAllianceChannelPost", () => {
  it("posts an emoji to the alliance-scoped reactions route", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${HUB_URL}/alliances/all-1/channels/chan-1/posts/post-1/reactions`);
      expect(JSON.parse(init!.body as string)).toEqual({ emoji: "👍" });
      return new Response(null, { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(reactAllianceChannelPost("all-1", "chan-1", "post-1", "👍")).resolves.toBeUndefined();
  });
});

describe("allianceForumWriteErrorCode", () => {
  it("matches an exact 403 body from the reaction proxy (status forwarded raw)", () => {
    const e = new HubApiError(403, "forum_remote_write_disabled");
    expect(allianceForumWriteErrorCode(String(e))).toBe("forum_remote_write_disabled");
  });

  it("matches a 502-wrapped body from the post/reply proxy (owning hub's gateway wraps the peer's text)", () => {
    const e = new HubApiError(
      502,
      "Failed to create forum post on peer: Peer returned HTTP 403 Forbidden: forum_remote_write_posts_disabled",
    );
    expect(allianceForumWriteErrorCode(String(e))).toBe("forum_remote_write_posts_disabled");
  });

  it("recognizes channel_not_shared_with_caller", () => {
    expect(allianceForumWriteErrorCode("channel_not_shared_with_caller")).toBe("channel_not_shared_with_caller");
  });

  it("returns null for unrelated errors", () => {
    expect(allianceForumWriteErrorCode("Could not reach hub.example — check the address and your connection.")).toBeNull();
  });
});
