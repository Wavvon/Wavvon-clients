import { describe, it, expect, beforeEach, vi } from "vitest";
import { setSession, setActiveHubId, resetHubSessions } from "../session";
import { getAllianceChannelPosts, getAllianceChannelPost } from "../commands/forum";
import type { PostListResponse, PostDetail } from "../../types";

// Forum federation read-through (forum.md §9): a shared channel of type
// "forum" fetches through /alliances/:id/channels/:cid/posts[/​:pid] instead
// of the local /channels/:cid/posts[/​:pid] routes, but the hub returns the
// exact same PostListResponse/PostDetail shapes either way -- these tests
// pin down the alliance-scoped URLs and confirm the response passes through
// untouched.

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

describe("getAllianceChannelPosts", () => {
  it("hits the alliance-scoped posts route with an optional cursor", async () => {
    const body: PostListResponse = { posts: [], cursor: undefined };
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe(`${HUB_URL}/alliances/all-1/channels/chan-1/posts?`);
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await getAllianceChannelPosts("all-1", "chan-1");
    expect(res).toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("forwards a pagination cursor as a query param", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe(`${HUB_URL}/alliances/all-1/channels/chan-1/posts?cursor=abc`);
      return new Response(JSON.stringify({ posts: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await getAllianceChannelPosts("all-1", "chan-1", "abc");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("getAllianceChannelPost", () => {
  it("hits the alliance-scoped post detail route and passes through replies", async () => {
    const body: PostDetail = {
      id: "post-1",
      channel_id: "chan-1",
      author_pubkey: "aa",
      title: "Hello",
      body: "World",
      created_at: 1,
      edited_at: null,
      is_pinned: false,
      is_locked: false,
      reply_count: 1,
      last_activity_at: 1,
      is_deleted: false,
      replies: [
        {
          id: "reply-1",
          post_id: "post-1",
          author_pubkey: "bb",
          body: "hi",
          created_at: 2,
          edited_at: null,
          reply_to_id: null,
          is_deleted: false,
        },
      ],
    };
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe(`${HUB_URL}/alliances/all-1/channels/chan-1/posts/post-1?`);
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await getAllianceChannelPost("all-1", "chan-1", "post-1");
    expect(res).toEqual(body);
  });
});
