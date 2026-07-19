import { describe, it, expect, beforeEach, vi } from "vitest";
import { setSession, setActiveHubId, resetHubSessions } from "../session";
import { adminGetBotCapabilities, adminSetBotCapabilities, sendBotAppJoin } from "../commands/bots";

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
