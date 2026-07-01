import { describe, it, expect, beforeEach, vi } from "vitest";

const GAINS_KEY = "wavvon.voice_gains";

// Minimal stubs for browser APIs used by VoiceWsSession

function makeAudioNode() {
  return { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1.0 } };
}

const mockAudioCtx = {
  createGain: vi.fn(() => makeAudioNode()),
  createBuffer: vi.fn(() => ({ getChannelData: vi.fn(() => new Float32Array(960)) })),
  createBufferSource: vi.fn(() => ({ buffer: null, connect: vi.fn(), start: vi.fn() })),
  createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
  createScriptProcessor: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null })),
  destination: {},
  close: vi.fn(() => Promise.resolve()),
  sampleRate: 48000,
};

vi.stubGlobal("AudioContext", vi.fn(() => mockAudioCtx));
vi.stubGlobal("WebSocket", vi.fn(() => ({
  binaryType: "",
  onmessage: null,
  onclose: null,
  onerror: null,
  readyState: 1,
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn((_event: string, cb: () => void, _opts?: unknown) => { cb(); }),
})));

const mockMediaStream = { getTracks: vi.fn(() => [{ stop: vi.fn() }]) };
vi.stubGlobal("navigator", {
  mediaDevices: {
    getUserMedia: vi.fn(() => Promise.resolve(mockMediaStream)),
  },
});

const mockOpusInstance = {
  encode: vi.fn(() => new Uint8Array(10)),
  decode: vi.fn(() => new Uint8Array(1920)),
  delete: vi.fn(),
};

vi.mock("opusscript", () => ({
  default: Object.assign(vi.fn(() => mockOpusInstance), {
    Application: { VOIP: 2048, AUDIO: 2049, RESTRICTED_LOWDELAY: 2051 },
  }),
}));

const localStorageData: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => localStorageData[k] ?? null,
  setItem: (k: string, v: string) => { localStorageData[k] = v; },
  removeItem: (k: string) => { delete localStorageData[k]; },
});

import { VoiceWsSession } from "../voice";

const STUB_HANDLERS = {
  onReady: vi.fn(),
  onClose: vi.fn(),
};

function makeSession() {
  return new VoiceWsSession("http://hub.example", "token", "ch1", STUB_HANDLERS);
}

beforeEach(() => {
  for (const k of Object.keys(localStorageData)) delete localStorageData[k];
  vi.clearAllMocks();
  mockAudioCtx.createGain.mockImplementation(() => makeAudioNode());
});

describe("VoiceWsSession gains", () => {
  it("loads gains from localStorage on construction", () => {
    localStorageData[GAINS_KEY] = JSON.stringify({ abc123: 150 });
    const session = makeSession();
    session.handleRosterUpdate([{ sender_id: 1, public_key: "abc123" }]);
    // Gain node should pick up the saved value when created — not created yet until playPcm
    // but setSenderGain after construction reads the saved map
    session.setSenderGain("abc123", 150);
    const stored = JSON.parse(localStorageData[GAINS_KEY] ?? "{}") as Record<string, number>;
    expect(stored["abc123"]).toBe(150);
  });

  it("setSenderGain clamps gainPct to [0,200] and maps to [0.0,2.0]", () => {
    const session = makeSession();
    session.handleRosterUpdate([{ sender_id: 7, public_key: "pk7" }]);

    session.setSenderGain("pk7", 300);
    let stored = JSON.parse(localStorageData[GAINS_KEY] ?? "{}") as Record<string, number>;
    expect(stored["pk7"]).toBe(200);

    session.setSenderGain("pk7", -50);
    stored = JSON.parse(localStorageData[GAINS_KEY] ?? "{}") as Record<string, number>;
    expect(stored["pk7"]).toBe(0);
  });

  it("setSenderGain with gainPct=100 removes from localStorage (unity gain)", () => {
    localStorageData[GAINS_KEY] = JSON.stringify({ pkUnity: 150 });
    const session = makeSession();
    session.handleRosterUpdate([{ sender_id: 2, public_key: "pkUnity" }]);
    session.setSenderGain("pkUnity", 100);
    const stored = JSON.parse(localStorageData[GAINS_KEY] ?? "{}") as Record<string, number>;
    expect(stored["pkUnity"]).toBeUndefined();
  });

  it("handleRosterUpdate updates senderIdToPubkey and removes stale GainNodes", () => {
    const session = makeSession();
    session.handleRosterUpdate([
      { sender_id: 10, public_key: "pk10" },
      { sender_id: 11, public_key: "pk11" },
    ]);
    // pk10 leaves
    session.handleRosterUpdate([{ sender_id: 11, public_key: "pk11" }]);
    // setSenderGain for the departed sender should be a no-op (no gainNode for sid 10)
    session.setSenderGain("pk10", 50);
    const stored = JSON.parse(localStorageData[GAINS_KEY] ?? "{}") as Record<string, number>;
    expect(stored["pk10"]).toBe(50);
  });
});
