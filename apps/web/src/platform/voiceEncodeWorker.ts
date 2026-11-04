import { voicePacketSeal, INITIAL_SUB_GATE_STATE, nextSubGateState, type SubGateState } from '@wavvon/core';
import { FRAME_SAMPLES, FrameTracker, type CaptureFrame, type CaptureStats } from './captureFraming';
import { mixClipIntoFrame, type ActiveClip } from './soundboardMix';
import type { OpusApplication } from './opusConfig';
import {
  DEFAULT_SPEAKING,
  INITIAL_SPEAKING_STATE,
  frameEnergy,
  nextSpeakingState,
  type EffectiveVad,
  type SpeakingState,
} from './speakingDetector';

export interface WorkerKey {
  key: Uint8Array;
  salt: Uint8Array;
  keyId: number;
}

export type ToWorker =
  | {
      type: 'init';
      opusApp: OpusApplication;
      channels: number;
      vad: EffectiveVad;
      muted: boolean;
      key: WorkerKey;
      url: string;
      certHash: Uint8Array | null;
      pcmPort: MessagePort;
    }
  | { type: 'key'; key: WorkerKey }
  | { type: 'muted'; muted: boolean }
  | { type: 'clip'; samples: Float32Array }
  | { type: 'stop' };

export type FromWorker =
  | { type: 'ready' }
  | { type: 'closed' }
  | { type: 'datagram'; data: Uint8Array }
  | { type: 'speaking'; speaking: boolean }
  | { type: 'gate'; warning: boolean }
  | { type: 'clipDone' }
  | { type: 'stats'; stats: CaptureStats };

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
  postMessage(m: FromWorker): void;
  close(): void;
};

const STATS_INTERVAL_MS = 1000;

let encoder: AudioEncoder | null = null;
// One entry per frame handed to the encoder, consumed in order by its output
// callback: WebCodecs encodes asynchronously, so the gate decision and the
// media clock of a frame have to travel beside it.
const pending: { gated: boolean; ts: number }[] = [];
let transport: WebTransport | null = null;
let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
let key: WorkerKey | null = null;
let ctr = 0n;
let timestamp = 0;
let vad: EffectiveVad = { enabled: true, threshold: DEFAULT_SPEAKING.threshold };
let muted = false;
let speakingState: SpeakingState = INITIAL_SPEAKING_STATE;
let subGate: SubGateState = INITIAL_SUB_GATE_STATE;
let activeClip: ActiveClip | null = null;
const tracker = new FrameTracker();
let statsTimer: ReturnType<typeof setInterval> | null = null;

function setSubGate(next: SubGateState): void {
  if (next.warning !== subGate.warning) scope.postMessage({ type: 'gate', warning: next.warning });
  subGate = next;
}

function setKey(next: WorkerKey): void {
  // A fresh key restarts the counter: ctr is per key generation.
  if (!key || key.keyId !== next.keyId) ctr = 0n;
  key = next;
}

/** Advances the speech detector and reports only the on/off edges. */
function updateSpeaking(micFrame: Float32Array): void {
  // VAD off: we transmit continuously, so anything but a steady "speaking"
  // would be a lie about what the other end is hearing. One edge, no release.
  if (!vad.enabled) {
    setSubGate(INITIAL_SUB_GATE_STATE);
    if (!speakingState.speaking) {
      speakingState = { speaking: true, lastLoudAt: Date.now() };
      scope.postMessage({ type: 'speaking', speaking: true });
    }
    return;
  }

  const energy = frameEnergy(micFrame);
  setSubGate(nextSubGateState(subGate, {
    energy, now: Date.now(), vadEnabled: true, threshold: vad.threshold, muted: false,
  }));
  const next = nextSpeakingState(speakingState, energy, Date.now(), {
    threshold: vad.threshold,
    holdMs: DEFAULT_SPEAKING.holdMs,
  });
  if (next.speaking !== speakingState.speaking) {
    scope.postMessage({ type: 'speaking', speaking: next.speaking });
  }
  speakingState = next;
}

function onFrame(frame: CaptureFrame): void {
  tracker.observe(frame.startFrame, frame.capturedAt, Date.now());
  // Muted frames are still counted above (the pipeline kept pace) but never
  // touch the detector, the clip or the encoder, as before the split.
  if (muted || !writer || !encoder || !key) return;

  const micFrame = frame.samples;

  // Speech detection runs on the raw mic frame, before the soundboard mix:
  // a clip playing through our own stream is not us talking.
  updateSpeaking(micFrame);

  const { output, nextClip } = mixClipIntoFrame(micFrame, activeClip);
  if (activeClip && !nextClip) scope.postMessage({ type: 'clipDone' });
  activeClip = nextClip;

  // "Enable voice activity detection (drops silence)" is what the settings
  // label promises: hold the datagram back while there is nothing to send.
  //
  // A playing soundboard clip counts, and has to be tested separately:
  // `updateSpeaking` runs on the raw mic frame on purpose, so a clip never
  // reads as speech, and gating on speech alone would silence the
  // soundboard. Safe for receivers by construction -- `ctr` only advances on
  // a send, so a gap is not counted as inbound loss, and the playout clock
  // rebuilds its lead after one (voicePlayout.ts).
  const silenceGated = !speakingState.speaking && !activeClip;

  // The encoder runs either way: it carries state between frames, and
  // starving it through a silence would make the first frame after one
  // pop. Only the send is skipped (`onEncoded`).
  const data = new AudioData({
    format: 'f32',
    sampleRate: 48000,
    numberOfFrames: FRAME_SAMPLES,
    numberOfChannels: 1,
    timestamp: Math.round((timestamp * 1_000_000) / 48000),
    data: output as Float32Array<ArrayBuffer>,
  });
  pending.push({ gated: silenceGated, ts: timestamp });
  try {
    encoder.encode(data);
  } catch {
    pending.pop();
  } finally {
    data.close();
  }
  // Advanced whether or not the frame went out: `timestamp` is a media
  // clock, and the desktop pipeline advances it through suppressed
  // frames too. `ctr` is the opposite -- it counts packets actually
  // sent, so it must only move inside the branch above or receivers
  // would read the silence as inbound loss.
  timestamp += FRAME_SAMPLES;
}

function onEncoded(chunk: EncodedAudioChunk): void {
  const frame = pending.shift();
  if (!frame || frame.gated || !writer || !key) return;
  const opus = new Uint8Array(chunk.byteLength);
  chunk.copyTo(opus);
  const sealed = voicePacketSeal(key.key, key.salt, key.keyId, ctr, frame.ts, opus);
  ctr += 1n;
  writer.write(sealed).catch(() => {});
}

function teardown(): void {
  if (statsTimer) clearInterval(statsTimer);
  statsTimer = null;
  try { writer?.close(); } catch { /* transport may already be gone */ }
  writer = null;
  try { transport?.close(); } catch { /* already closed */ }
  transport = null;
  if (encoder && encoder.state !== 'closed') encoder.close();
  encoder = null;
  pending.length = 0;
}

async function openTransport(url: string, certHash: Uint8Array | null): Promise<void> {
  const options: WebTransportOptions | undefined = certHash
    // Re-wrap: the declared `Uint8Array` type erases the `ArrayBuffer`
    // generic BufferSource needs.
    ? { serverCertificateHashes: [{ algorithm: 'sha-256', value: new Uint8Array(certHash) }] }
    : undefined;
  const wt = new WebTransport(url, options);
  transport = wt;
  wt.closed.then(() => scope.postMessage({ type: 'closed' }), () => scope.postMessage({ type: 'closed' }));
  try {
    await wt.ready;
  } catch {
    return;
  }
  writer = wt.datagrams.writable.getWriter();
  scope.postMessage({ type: 'ready' });
  const reader = wt.datagrams.readable.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) scope.postMessage({ type: 'datagram', data: value });
    }
  } catch { /* transport closed — `closed` above drives teardown */ }
}

scope.onmessage = (e) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      encoder = new AudioEncoder({
        output: onEncoded,
        // A failed encoder sends nothing, so end the session rather than
        // leave a connected room that is silently mute.
        error: () => {
          encoder = null;
          transport?.close();
        },
      });
      encoder.configure({
        codec: 'opus',
        sampleRate: 48000,
        numberOfChannels: msg.channels,
        // `application` is in the WebCodecs Opus registry but not yet in
        // TypeScript's DOM types.
        opus: { frameDuration: 20_000, application: msg.opusApp } as OpusEncoderConfig,
      });
      vad = msg.vad;
      muted = msg.muted;
      setKey(msg.key);
      msg.pcmPort.onmessage = (ev: MessageEvent<CaptureFrame>) => onFrame(ev.data);
      void openTransport(msg.url, msg.certHash);
      statsTimer = setInterval(() => scope.postMessage({ type: 'stats', stats: tracker.snapshot() }), STATS_INTERVAL_MS);
      break;
    case 'key':
      setKey(msg.key);
      break;
    case 'muted':
      muted = msg.muted;
      if (muted) setSubGate(INITIAL_SUB_GATE_STATE);
      break;
    case 'clip':
      activeClip = { samples: msg.samples, pos: 0 };
      break;
    case 'stop':
      teardown();
      scope.close();
      break;
  }
};
