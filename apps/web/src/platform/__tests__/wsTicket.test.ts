import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// On a hub offering `ws.ticket` the session token must not appear in the
// socket URL (reverse proxies log URLs): the socket trades it for a ticket
// first. An older hub, or a ticket that could not be had, gets the token.

const capabilities = new Set<string>();
vi.mock("../session", () => ({
  hubSupports: (_hub: string, cap: string) => capabilities.has(cap),
}));

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  binaryType = "blob";
  readyState = 0;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send() {}
  close() {}
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  capabilities.clear();
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openedUrl(): Promise<string> {
  const { HubWebSocket } = await import("../ws");
  const ws = new HubWebSocket("https://hub.example", "secret-token", "h", {});
  await vi.waitFor(() => expect(FakeWebSocket.instances.length).toBe(1));
  ws.close();
  return FakeWebSocket.instances[0].url;
}

describe("HubWebSocket credential", () => {
  it("opens with a ticket, never the token, where the hub offers one", async () => {
    capabilities.add("ws.ticket");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ticket: "t1", expires_in: 30 })));
    vi.stubGlobal("fetch", fetchMock);
    const url = await openedUrl();
    expect(url).toBe("wss://hub.example/ws?ticket=t1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://hub.example/ws/ticket",
      expect.objectContaining({ method: "POST", headers: { Authorization: "Bearer secret-token" } }),
    );
  });

  it("falls back to the token on an older hub or when no ticket comes back", async () => {
    expect(await openedUrl()).toBe("wss://hub.example/ws?token=secret-token");

    FakeWebSocket.instances = [];
    capabilities.add("ws.ticket");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    expect(await openedUrl()).toBe("wss://hub.example/ws?token=secret-token");
  });
});
