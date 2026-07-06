import { describe, it, expect, beforeEach, vi } from "vitest";

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

describe("VoiceWsSession.playClip rate limit", () => {
  it("starts playback and reports the playing clip id", () => {
    const session = makeSession();
    expect(session.getPlayingClipId()).toBeNull();
    const started = session.playClip("clip-1", new Float32Array([0.1, 0.2]));
    expect(started).toBe(true);
    expect(session.getPlayingClipId()).toBe("clip-1");
  });

  it("refuses to start a second clip while one is already playing (no overlap)", () => {
    const session = makeSession();
    expect(session.playClip("clip-1", new Float32Array([0.1, 0.2]))).toBe(true);
    expect(session.playClip("clip-2", new Float32Array([0.3]))).toBe(false);
    expect(session.getPlayingClipId()).toBe("clip-1");
  });

});
