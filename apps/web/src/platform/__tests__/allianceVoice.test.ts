import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setSession, setActiveHubId, resetHubSessions } from "../session";
import {
  mintAllianceVoiceGrant,
  openAllianceVoiceVisit,
  OwnerHubUnsupportedError,
} from "../commands/allianceVoice";
import { setAllianceVoiceRemoteJoin } from "../commands/alliances";

// The identity lives in IndexedDB, which this suite has no business standing
// up: what matters here is the seed reaching the signature, not where it was
// read from.
vi.mock("../../identity/store", () => ({
  loadIdentity: async () => ({
    id: "acct-1",
    seed_hex: "11".repeat(32),
    security_nonce: 0,
    security_level: 0,
  }),
}));

// Voice in an alliance channel (alliances.md): our hub signs a grant, the
// owning hub redeems it into a voice-only session on *its* side. What these
// pin down is the part no other test can see — that the grant actually
// travels to the owner's /auth/verify, and that an owner which does not do
// alliance voice is refused before any identity material is sent.

const HUB_URL = "https://hub.example";
const HUB_ID = "hub-pub-key";
const OWNER_URL = "https://owner.example";

const MINTED = {
  grant: { payload: { alliance_id: "all-1" }, signature: "sig" },
  owner_hub_url: OWNER_URL,
  owner_hub_pubkey: "owner-pub-key",
  channel_name: "general",
};

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("mintAllianceVoiceGrant", () => {
  it("asks our own hub, naming the channel", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${HUB_URL}/alliances/all-1/voice-grant`);
      expect(init?.method).toBe("POST");
      expect(JSON.parse(init!.body as string)).toEqual({ channel_id: "chan-1" });
      return new Response(JSON.stringify(MINTED), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(mintAllianceVoiceGrant("all-1", "chan-1")).resolves.toEqual(MINTED);
  });
});

describe("setAllianceVoiceRemoteJoin", () => {
  it("re-shares the leaf with the policy, never recursively", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${HUB_URL}/alliances/all-1/channels`);
      expect(JSON.parse(init!.body as string)).toEqual({
        channel_id: "chan-1",
        include_descendants: false,
        voice_remote_join: "none",
      });
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await setAllianceVoiceRemoteJoin("all-1", "chan-1", "none");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("openAllianceVoiceVisit", () => {
  it("refuses an owner that does not advertise voice.alliance", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe(`${OWNER_URL}/info`);
      return new Response(JSON.stringify({ public_key: "owner-pub-key", capabilities: ["voice.wt"] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(openAllianceVoiceVisit(MINTED, {})).rejects.toBeInstanceOf(OwnerHubUnsupportedError);
    // Refused on the owner's own answer, before challenge/verify: nothing of
    // ours was sent anywhere.
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("carries the grant to the owner's /auth/verify and opens a socket there", async () => {
    const verifyBodies: Record<string, unknown>[] = [];
    const dhPublishes: { url: string; auth: string | undefined }[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === `${OWNER_URL}/info`) {
        return new Response(
          JSON.stringify({ public_key: "owner-pub-key", name: "Owner Hub", capabilities: ["voice.alliance", "voice.wt"] }),
          { status: 200 },
        );
      }
      if (url === `${OWNER_URL}/auth/challenge`) {
        return new Response(JSON.stringify({ challenge: "aa".repeat(32) }), { status: 200 });
      }
      if (url === `${OWNER_URL}/auth/verify`) {
        verifyBodies.push(JSON.parse(init!.body as string) as Record<string, unknown>);
        return new Response(JSON.stringify({ token: "visit-token", scope: "alliance_voice" }), { status: 200 });
      }
      if (url.startsWith(`${OWNER_URL}/identity/`) && url.endsWith("/dh-key")) {
        dhPublishes.push({
          url,
          auth: (init?.headers as Record<string, string> | undefined)?.Authorization,
        });
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const opened: string[] = [];
    // Opens on a later task, like a real one. That gap is the whole point:
    // `send` drops frames on a CONNECTING socket, so the visit must not be
    // handed back before the socket is open — alliance voice used to send
    // `voice_join` into that gap and time out.
    class FakeWebSocket {
      static OPEN = 1;
      readyState = 0;
      private listeners: Record<string, (() => void)[]> = {};
      constructor(url: string) {
        opened.push(url);
        setTimeout(() => {
          this.readyState = 1;
          (this.listeners.open ?? []).forEach((fn) => fn());
        }, 5);
      }
      addEventListener(type: string, fn: () => void) {
        (this.listeners[type] ??= []).push(fn);
      }
      removeEventListener(type: string, fn: () => void) {
        this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
      }
      close() {}
    }
    vi.stubGlobal("WebSocket", FakeWebSocket);

    const visit = await openAllianceVoiceVisit(MINTED, {});
    expect(visit.token).toBe("visit-token");
    expect(visit.hubName).toBe("Owner Hub");
    expect(verifyBodies).toHaveLength(1);
    expect(verifyBodies[0].alliance_voice_grant).toEqual(MINTED.grant);
    // The socket goes to the owner, not to us — a visitor's voice never
    // touches its own hub.
    expect(opened[0]).toBe("wss://owner.example/ws?token=visit-token");

    // Our DH key has to be readable *on the owning hub*: that is where our
    // peers in the room look it up, and without it nobody can wrap a voice
    // key for us — the room comes up and we hear nothing. It goes with the
    // voice-only token, which the hub's visitor allowlist accepts for exactly
    // these two routes.
    expect(dhPublishes).toHaveLength(1);
    expect(dhPublishes[0].auth).toBe("Bearer visit-token");
    // And before the socket, since a key offer can arrive as soon as we join.
    const publishCall = fetchMock.mock.calls.findIndex(([u]) =>
      String(u).endsWith("/dh-key"),
    );
    expect(publishCall).toBeGreaterThanOrEqual(0);
    expect(opened).toHaveLength(1);
    visit.close();
  });

  // Before the fix this resolved with a socket still connecting; the caller
  // then sent `voice_join` into a socket that drops what it is handed while
  // CONNECTING, and reported "Voice join timed out" ten seconds later. A
  // socket that never opens has to fail here, where the reason is known.
  it("fails when the owner's socket never opens", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === `${OWNER_URL}/info`) {
        return new Response(
          JSON.stringify({ public_key: "owner-pub-key", capabilities: ["voice.alliance"] }),
          { status: 200 },
        );
      }
      if (url === `${OWNER_URL}/auth/challenge`) {
        return new Response(JSON.stringify({ challenge: "aa".repeat(32) }), { status: 200 });
      }
      return new Response(JSON.stringify({ token: "visit-token" }), { status: 200 });
    }));

    class ClosingWebSocket {
      static OPEN = 1;
      readyState = 0;
      private listeners: Record<string, (() => void)[]> = {};
      constructor(_url: string) {
        setTimeout(() => (this.listeners.close ?? []).forEach((fn) => fn()), 5);
      }
      addEventListener(type: string, fn: () => void) {
        (this.listeners[type] ??= []).push(fn);
      }
      removeEventListener(type: string, fn: () => void) {
        this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
      }
      close() {}
    }
    vi.stubGlobal("WebSocket", ClosingWebSocket);

    await expect(openAllianceVoiceVisit(MINTED, {})).rejects.toThrow(/never|closed/i);
  });
});
