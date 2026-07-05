import OpusScript from 'opusscript';
import { resolveVoiceChannelId } from './voiceReady';

export interface VoiceZoneAttenuation {
  model: 'linear' | 'inverse_square' | 'step' | 'exponential';
  max_radius: number;
  ref_dist: number;
  rolloff: number;
}

export interface VoiceZone {
  zone_id: string;
  name: string;
  coordinate_system: string;
  attenuation: VoiceZoneAttenuation;
  positions: Record<string, number[]>;
}

export function computeAttenuation(dist: number, cfg: VoiceZoneAttenuation): number {
  if (dist >= cfg.max_radius) return 0;
  const t = dist / cfg.max_radius;
  switch (cfg.model) {
    case 'linear':
      return 1 - t;
    case 'inverse_square': {
      const d = Math.max(dist, cfg.ref_dist);
      return Math.min(1, (cfg.ref_dist / d) ** 2);
    }
    case 'step':
      return dist <= cfg.ref_dist ? 1 : 0;
    case 'exponential':
      return Math.exp(-cfg.rolloff * t);
    default:
      return 1;
  }
}

export interface VoiceSessionHandlers {
  /** `channelId` is the room the join actually landed in — for a spawner
   *  join this is the newly-spawned sibling room, not the channel id the
   *  caller passed to the constructor. */
  onReady: (senderId: number, participants: unknown[], channelId: string) => void;
  onClose: () => void;
}

export interface AudioProfileConfig {
  profile: 'standard' | 'music' | 'custom';
  customBitrate?: number | null;
  customApp?: 'voip' | 'audio' | 'lowdelay';
  customNoiseSuppress?: boolean;
  customVad?: boolean;
  customVadThreshold?: number;
  customChannels?: 1 | 2;
  customFrameMs?: 20 | 40 | 60;
  customComplexity?: number;
}

interface OpusCodec {
  encode(buffer: Uint8Array, frameSize: number): Uint8Array;
  decode(buffer: Uint8Array): Uint8Array;
  delete(): void;
}

const OPUS_FRAME_SIZE = 960; // 20 ms at 48 kHz
const GAINS_STORAGE_KEY = 'wavvon.voice_gains';

/** Playback cursor into a decoded soundboard clip mid-mix (soundboard.md
 *  §1: the clip rides the sender's own outgoing stream). */
export interface ActiveClip {
  samples: Float32Array;
  pos: number;
}

/** Pure sample-add mix of a mic capture frame with whatever's left of an
 *  in-flight soundboard clip, clamped to the valid float PCM range so a
 *  loud clip under a loud mic can't wrap around instead of just clipping.
 *  Called once per `onaudioprocess` frame, ahead of Opus encoding, so the
 *  clip is baked into the *outgoing* stream rather than played locally. */
export function mixClipIntoFrame(
  micFrame: Float32Array,
  clip: ActiveClip | null,
): { output: Float32Array; nextClip: ActiveClip | null } {
  const output = new Float32Array(micFrame.length);
  const samples = clip?.samples;
  let pos = clip?.pos ?? 0;

  for (let i = 0; i < micFrame.length; i++) {
    let sample = micFrame[i];
    if (samples && pos < samples.length) {
      sample += samples[pos];
      pos++;
    }
    output[i] = Math.max(-1, Math.min(1, sample));
  }

  const nextClip = samples && pos < samples.length ? { samples, pos } : null;
  return { output, nextClip };
}

/** Averages N channel buffers down to mono. Opus (and this mixer) only
 *  deals in mono at 48 kHz; a stereo clip is folded down before mixing. */
export function downmixChannels(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const length = channels[0].length;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const ch of channels) sum += ch[i];
    out[i] = sum / channels.length;
  }
  return out;
}

export class VoiceWsSession {
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private encoder: OpusCodec | null = null;
  private decoder: OpusCodec | null = null;
  private sequence = 0;
  private timestamp = 0;
  private muted = false;
  private deafened = false;
  private closed = false;
  private sampleAccum = new Int16Array(OPUS_FRAME_SIZE);
  private sampleAccumLen = 0;
  private gainNodes: Map<number, GainNode> = new Map();
  private senderIdToPubkey: Map<number, string> = new Map();
  private savedGains: Record<string, number>;
  private zones: Map<string, VoiceZone> = new Map();
  private myPubkey: string;
  private activeClip: ActiveClip | null = null;
  private activeClipId: string | null = null;

  constructor(
    private hubUrl: string,
    private token: string,
    private channelId: string,
    private handlers: VoiceSessionHandlers,
    private audioConfig?: AudioProfileConfig,
    myPubkey?: string,
  ) {
    this.myPubkey = myPubkey ?? "";
    try {
      this.savedGains = JSON.parse(localStorage.getItem(GAINS_STORAGE_KEY) || '{}') as Record<string, number>;
    } catch {
      this.savedGains = {};
    }
  }

  async start(): Promise<void> {
    let opusApp = OpusScript.Application.VOIP;
    let channels = 1;

    if (this.audioConfig) {
      if (this.audioConfig.profile === 'music') {
        opusApp = OpusScript.Application.AUDIO;
        channels = 2;
      } else if (this.audioConfig.profile === 'custom') {
        const appMap = {
          voip: OpusScript.Application.VOIP,
          audio: OpusScript.Application.AUDIO,
          lowdelay: OpusScript.Application.RESTRICTED_LOWDELAY,
        };
        opusApp = appMap[this.audioConfig.customApp ?? 'voip'];
        channels = this.audioConfig.customChannels ?? 1;
      }
    }

    this.encoder = new OpusScript(48000, channels, opusApp, { wasm: false }) as unknown as OpusCodec;
    this.decoder = new OpusScript(48000, 1, OpusScript.Application.VOIP, { wasm: false }) as unknown as OpusCodec;

    // Honor the user's chosen input device (Settings → Voice), if any.
    let inputId: string | null = null;
    try { inputId = localStorage.getItem("wavvon.audioInputDevice"); } catch { /* ignore */ }
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: inputId ? { deviceId: { exact: inputId } } : true,
    });

    this.audioCtx = new AudioContext({ sampleRate: 48000 });
    // Route playback to the chosen output device where supported (Chrome 110+).
    try {
      const outputId = localStorage.getItem("wavvon.audioOutputDevice");
      const ctx = this.audioCtx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
      if (outputId && typeof ctx.setSinkId === "function") {
        await ctx.setSinkId(outputId).catch(() => { /* device gone — fall back to default */ });
      }
    } catch { /* setSinkId unsupported */ }
    const source = this.audioCtx.createMediaStreamSource(this.mediaStream);
    this.processor = this.audioCtx.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => this.onAudioProcess(e);
    source.connect(this.processor);
    this.processor.connect(this.audioCtx.destination);

    const wsBase = this.hubUrl
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://');
    const url = `${wsBase}/voice/ws?token=${encodeURIComponent(this.token)}&channel_id=${encodeURIComponent(this.channelId)}`;
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onmessage = (ev) => this.onWsMessage(ev);
    this.ws.onclose = () => {
      if (!this.closed) this.handlers.onClose();
    };
    this.ws.onerror = () => this.ws?.close();

    await new Promise<void>((resolve, reject) => {
      const ws = this.ws!;
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(new Error('Voice WS failed to open')), { once: true });
    });
  }

  private onAudioProcess(e: AudioProcessingEvent): void {
    if (this.muted || !this.ws || this.ws.readyState !== WebSocket.OPEN || !this.encoder) return;

    const micFrame = e.inputBuffer.getChannelData(0);
    const { output, nextClip } = mixClipIntoFrame(micFrame, this.activeClip);
    this.activeClip = nextClip;
    if (!this.activeClip) this.activeClipId = null;

    let offset = 0;

    while (offset < output.length) {
      const space = OPUS_FRAME_SIZE - this.sampleAccumLen;
      const take = Math.min(space, output.length - offset);
      for (let i = 0; i < take; i++) {
        this.sampleAccum[this.sampleAccumLen + i] = Math.max(-32768, Math.min(32767, output[offset + i] * 32767));
      }
      this.sampleAccumLen += take;
      offset += take;

      if (this.sampleAccumLen === OPUS_FRAME_SIZE) {
        let opusBytes: Uint8Array;
        try {
          opusBytes = this.encoder.encode(new Uint8Array(this.sampleAccum.buffer), OPUS_FRAME_SIZE);
        } catch {
          this.sampleAccumLen = 0;
          return;
        }

        const packet = new ArrayBuffer(6 + opusBytes.length);
        const view = new DataView(packet);
        view.setUint16(0, this.sequence & 0xffff, false);
        view.setUint32(2, this.timestamp & 0xffffffff, false);
        new Uint8Array(packet, 6).set(opusBytes);
        this.sequence++;
        this.timestamp += OPUS_FRAME_SIZE;
        this.ws.send(packet);
        this.sampleAccumLen = 0;
      }
    }
  }

  private onWsMessage(ev: MessageEvent): void {
    if (typeof ev.data === 'string') {
      try {
        const msg = JSON.parse(ev.data) as Record<string, unknown>;
        if (msg.type === 'voice_ws_ready') {
          const participants = msg.participants as Array<{ sender_id: number; public_key: string }> | undefined;
          if (participants) {
            this.handleRosterUpdate(participants);
          }
          const resolvedChannelId = resolveVoiceChannelId(this.channelId, msg as { channel_id?: string });
          this.handlers.onReady(
            msg.sender_id as number,
            msg.participants as unknown[],
            resolvedChannelId,
          );
        }
      } catch {}
      return;
    }

    if (this.deafened || !this.decoder) return;

    const data = new Uint8Array(ev.data as ArrayBuffer);
    if (data.length < 9) return;
    // Wire format: [sender_id: u16 BE][packet_type: u8][seq: u16 BE][ts: u32 BE][opus...]
    const senderId = (data[0] << 8) | data[1];
    const packetType = data[2];
    // 0x00 = normal, 0x01 = whisper (targeted). Play both — the server only
    // delivers whisper frames to resolved targets, so receiving one means
    // it's meant for us.
    if (packetType !== 0x00 && packetType !== 0x01) return;
    const opusBytes = data.slice(9);

    let pcm: Uint8Array;
    try {
      pcm = this.decoder.decode(opusBytes);
    } catch {
      return;
    }

    this.playPcm(new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2), senderId);
  }

  private getOrCreateGainNode(senderId: number): GainNode {
    const existing = this.gainNodes.get(senderId);
    if (existing) return existing;

    const gainNode = this.audioCtx!.createGain();
    const pubkey = this.senderIdToPubkey.get(senderId);
    if (pubkey && this.savedGains[pubkey] !== undefined) {
      gainNode.gain.value = this.savedGains[pubkey] / 100;
    } else {
      gainNode.gain.value = 1.0;
    }
    gainNode.connect(this.audioCtx!.destination);
    this.gainNodes.set(senderId, gainNode);
    return gainNode;
  }

  private playPcm(pcm: Int16Array, senderId: number): void {
    if (!this.audioCtx) return;
    const buffer = this.audioCtx.createBuffer(1, pcm.length, 48000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) {
      channel[i] = pcm[i] / 32767;
    }
    const src = this.audioCtx.createBufferSource();
    src.buffer = buffer;
    const gainNode = this.getOrCreateGainNode(senderId);
    src.connect(gainNode);
    src.start();
  }

  handleRosterUpdate(participants: { sender_id: number; public_key: string }[]): void {
    const activeIds = new Set(participants.map((p) => p.sender_id));

    for (const [sid] of this.senderIdToPubkey) {
      if (!activeIds.has(sid)) {
        const gainNode = this.gainNodes.get(sid);
        if (gainNode) {
          gainNode.disconnect();
          this.gainNodes.delete(sid);
        }
        this.senderIdToPubkey.delete(sid);
      }
    }

    for (const p of participants) {
      this.senderIdToPubkey.set(p.sender_id, p.public_key);
    }
  }

  handleZoneState(_channelId: string, zones: VoiceZone[]): void {
    this.zones.clear();
    for (const z of zones) this.zones.set(z.zone_id, z);
    this.recomputeAllProximityGains();
  }

  handleZoneCreated(msg: { zone_id: string; name: string; coordinate_system: string; attenuation: VoiceZoneAttenuation }): void {
    this.zones.set(msg.zone_id, { ...msg, positions: {} });
  }

  handleZoneDestroyed(zoneId: string): void {
    this.zones.delete(zoneId);
    this.recomputeAllProximityGains();
  }

  handlePositionUpdated(zoneId: string, pubkey: string, position: number[]): void {
    const z = this.zones.get(zoneId);
    if (!z) return;
    z.positions[pubkey] = position;
    this.recomputeAllProximityGains();
  }

  setMyPosition(zoneId: string, position: number[]): void {
    const z = this.zones.get(zoneId);
    if (!z) return;
    z.positions[this.myPubkey] = position;
    this.recomputeAllProximityGains();
  }

  private recomputeAllProximityGains(): void {
    for (const [senderId, pubkey] of this.senderIdToPubkey) {
      let proximityGain = 1.0;

      for (const zone of this.zones.values()) {
        const senderPos = zone.positions[pubkey];
        const myPos = zone.positions[this.myPubkey];
        if (!senderPos || !myPos) continue;

        const dist = Math.sqrt(
          senderPos.reduce((acc, v, i) => acc + (v - (myPos[i] ?? 0)) ** 2, 0)
        );
        proximityGain = Math.min(proximityGain, computeAttenuation(dist, zone.attenuation));
      }

      const manualGainPct = this.savedGains[pubkey] ?? 100;
      const effective = Math.min(200, Math.max(0, manualGainPct * proximityGain));
      const gainNode = this.gainNodes.get(senderId);
      if (gainNode) gainNode.gain.value = effective / 100;
    }
  }

  setSenderGain(pubkey: string, gainPct: number): void {
    const clamped = Math.max(0, Math.min(200, gainPct));
    const gainValue = clamped / 100;

    const stored = { ...this.savedGains };
    if (Math.abs(gainValue - 1.0) < 0.001) {
      delete stored[pubkey];
    } else {
      stored[pubkey] = clamped;
    }
    this.savedGains = stored;
    try {
      localStorage.setItem(GAINS_STORAGE_KEY, JSON.stringify(stored));
    } catch {}

    for (const [sid, pk] of this.senderIdToPubkey) {
      if (pk === pubkey) {
        const gainNode = this.gainNodes.get(sid);
        if (gainNode) {
          gainNode.gain.value = gainValue;
        }
        break;
      }
    }
  }

  /** Decodes a soundboard clip's Opus-in-Ogg bytes to mono PCM at this
   *  session's sample rate via the browser's native Opus decoder, ready to
   *  hand to `playClip`. Requires the session to be started (needs a live
   *  AudioContext). */
  async decodeClipPcm(bytes: ArrayBuffer): Promise<Float32Array> {
    if (!this.audioCtx) throw new Error('Voice session is not active');
    const buffer = await this.audioCtx.decodeAudioData(bytes.slice(0));
    const channels: Float32Array[] = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
    return downmixChannels(channels);
  }

  /** Queues decoded clip PCM to be mixed into the next outgoing audio
   *  frames (soundboard.md §1). Returns false without side effects if a
   *  clip is already playing — the client-side "one clip at a time" rule
   *  that keeps a spam-triggered clip from stacking a wall of overlapping
   *  audio into the caller's own stream. */
  playClip(clipId: string, samples: Float32Array): boolean {
    if (this.activeClip) return false;
    this.activeClip = { samples, pos: 0 };
    this.activeClipId = clipId;
    return true;
  }

  getPlayingClipId(): string | null {
    return this.activeClipId;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  setDeafened(deafened: boolean): void {
    this.deafened = deafened;
    if (deafened) this.muted = true;
  }

  stop(): void {
    this.closed = true;
    this.sampleAccumLen = 0;
    this.processor?.disconnect();
    this.processor = null;
    for (const track of this.mediaStream?.getTracks() ?? []) track.stop();
    this.mediaStream = null;
    for (const [, gainNode] of this.gainNodes) {
      gainNode.disconnect();
    }
    this.gainNodes.clear();
    this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
    this.ws?.close();
    this.ws = null;
    this.encoder?.delete();
    this.decoder?.delete();
    this.encoder = null;
    this.decoder = null;
  }
}
