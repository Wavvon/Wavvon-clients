import { describe, it, expect, beforeEach, vi } from "vitest";
import { setSession, setActiveHubId, resetHubSessions } from "../session";
import { redeemInvite } from "../commands/hubs";

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
    token: "active-token",
    ws: null,
  });
  setActiveHubId(HUB_ID);
});

describe("redeemInvite", () => {
  it("POSTs the invite to the active hub's member-join route", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${HUB_URL}/join/ABC123`);
      expect(init?.method).toBe("POST");
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await redeemInvite("ABC123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("escapes the code rather than pasting it into the path", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe(`${HUB_URL}/join/a%2F..%2Fb`);
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await redeemInvite("a/../b");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces the hub's refusal instead of swallowing it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Invite expired", { status: 410 })));
    await expect(redeemInvite("OLD")).rejects.toThrow();
  });
});
