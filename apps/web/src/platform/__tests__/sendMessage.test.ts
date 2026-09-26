import { describe, it, expect, beforeEach, vi } from "vitest";
import { setSession, setActiveHubId, resetHubSessions } from "../session";
import { sendMessage } from "../commands/messages";

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

// The composer renders the returned message itself rather than waiting for the
// socket to echo it, so what this call resolves to is the contract that keeps a
// message sent over a dead socket from vanishing out of its author's own view.
describe("sendMessage", () => {
  it("resolves to the stored message the hub returns with its 201", async () => {
    const stored = { id: "m1", channel_id: "c1", sender: "pk", content: "hi" };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${HUB_URL}/channels/c1/messages`);
      expect(init?.method).toBe("POST");
      return new Response(JSON.stringify(stored), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }));

    expect(await sendMessage("c1", "hi")).toMatchObject(stored);
  });

  it("resolves to null on the slash-command 200, whose reply arrives over the socket", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ id: "placeholder", channel_id: "c1", content: "unknown command" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    expect(await sendMessage("c1", "/nope")).toBeNull();
  });
});
