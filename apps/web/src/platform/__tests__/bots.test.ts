import { describe, it, expect, beforeEach, vi } from "vitest";
import { setSession, setActiveHubId, resetHubSessions } from "../session";
import { adminGetBotCapabilities, adminSetBotCapabilities, sendBotAppJoin, listBots, getBotProfile } from "../commands/bots";

const HUB_URL = "https://hub.example";
const HUB_ID = "hub-pub-key";
const PUBKEY = "bot-pub-key";

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

describe("adminGetBotCapabilities", () => {
  it("GETs the capabilities route for the given bot and returns the parsed grant set", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${HUB_URL}/admin/bots/${PUBKEY}/capabilities`);
      expect(init?.method ?? "GET").toBe("GET");
      return new Response(
        JSON.stringify({ requested: ["can_speak_voice"], granted: [], effective: [] }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await adminGetBotCapabilities(PUBKEY);
    expect(result).toEqual({ requested: ["can_speak_voice"], granted: [], effective: [] });
  });
});

describe("adminSetBotCapabilities", () => {
  it("PUTs the full granted set as the request body", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${HUB_URL}/admin/bots/${PUBKEY}/capabilities`);
      expect(init?.method).toBe("PUT");
      expect(JSON.parse(init?.body as string)).toEqual({ capabilities: ["can_speak_voice", "can_use_interactive_ui"] });
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await adminSetBotCapabilities(PUBKEY, ["can_speak_voice", "can_use_interactive_ui"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("sendBotAppJoin", () => {
  it("sends a bot_app_join message over the active hub's WebSocket", () => {
    const send = vi.fn();
    setSession(HUB_ID, {
      hub_id: HUB_ID,
      hub_url: HUB_URL,
      hub_pubkey: HUB_ID,
      hub_name: "Hub",
      hub_icon: null,
      token: "active-token",
      ws: { send, close: () => {} } as unknown as import("../ws").HubWebSocket,
    });

    sendBotAppJoin(PUBKEY, "channel-1");

    expect(send).toHaveBeenCalledWith({ type: "bot_app_join", bot_id: PUBKEY, channel_id: "channel-1" });
  });

  it("is a no-op when there is no live WebSocket yet", () => {
    expect(() => sendBotAppJoin(PUBKEY, "channel-1")).not.toThrow();
  });
});

describe("listBots", () => {
  it("carries the game descriptor through when a bot declares one", async () => {
    const game = { entry_url: "https://example.com/play", name: "Trivia", thumbnail_url: "https://example.com/thumb.png" };
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe(`${HUB_URL}/bots`);
      return new Response(
        JSON.stringify([
          { pubkey: PUBKEY, name: "Trivia Bot", game, commands: [] },
          { pubkey: "other-bot", name: "Plain Bot", commands: [] },
        ]),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const bots = await listBots();
    expect(bots[0].game).toEqual(game);
    expect(bots[1].game).toBeUndefined();
  });
});

describe("getBotProfile", () => {
  it("looks up the bot by pubkey from the directory list and preserves game", async () => {
    const game = { entry_url: "https://example.com/play", name: "Trivia" };
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify([{ pubkey: PUBKEY, name: "Trivia Bot", description: "Quiz night", game, commands: [] }]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const profile = await getBotProfile(PUBKEY);
    expect(profile).toEqual({
      pubkey: PUBKEY,
      name: "Trivia Bot",
      avatar_url: null,
      description: "Quiz night",
      commands: [],
      game,
    });
  });

  it("throws when the pubkey is not in the directory", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
    await expect(getBotProfile(PUBKEY)).rejects.toThrow();
  });
});
