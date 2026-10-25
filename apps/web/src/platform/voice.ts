import OpusScript from 'opusscript';
import { hexToBytes, voicePacketOpen } from '@wavvon/core';
import { getScoped, setScoped } from '../utils/accountScope';
import { VoiceKeyManager, type VoiceKeyBundle } from './voiceKeys';
import { parseDownlinkDatagram, peekSealedKeyId, ReplayGuard } from './voiceDatagram';
import { nextPlayoutStart } from './voicePlayout';
import { lossPercent, trackPacket, type LossTracker } from './connectionStats';
import { CAPTURE_SAMPLE_RATE, captureMic } from './micCapture';
import { resolveOpusConfig } from './opusConfig';
import { effectiveVad } from './speakingDetector';
import { INITIAL_CAPTURE_STATS, type CaptureStats } from './captureFraming';
import { downmixChannels } from './soundboardMix';
import captureWorkletUrl from './captureWorklet?worker&url';
import type { FromWorker, ToWorker } from './voiceEncodeWorker';

export { mixClipIntoFrame, downmixChannels, type ActiveClip } from './soundboardMix';

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
  /** Send a `voice_key_offer` over the MAIN hub WS (voice-transport-v2.md
   *  "E2E key distribution") — the WebTransport session has no signaling
   *  channel of its own, only datagrams. */
  sendKeyOffer: (channelId: string, bundles: VoiceKeyBundle[]) => void;
  /** Called only when speech starts or stops, never per frame. */
  sendSpeaking: (channelId: string, speaking: boolean) => void;
  /** Called only when the mic-below-threshold warning turns on or off. */
  onGateWarning?: (warning: boolean) => void;
}

/** What `voice_join` gets back from the hub (the `voice_joined` reply) —
 *  everything the session needs to open its WebTransport connection and
 *  seed the initial key exchange, gathered by the caller (useVoice) before
 *  constructing a session. */
export interface VoiceJoinInfo {
  channelId: string;
  senderId: number;
  participants: { sender_id: number; public_key: string }[];
  wtUrl: string;
  token: string;
  certHash: string | null;
}

export interface AudioProfileConfig {
  profile: 'standard' | 'music' | 'custom';
  customBitrate?: number | null;
  customApp?: 'voip' | 'audio' | 'lowdelay';
  customNoiseSuppress?: boolean;
  customVad?: boolean;
  /** Sensitivity under every gating profile; customVadThreshold overrides it
   *  inside custom only. Without this the engine could not see a threshold
   *  set outside the custom panel — see effectiveVad. */
  vadThreshold?: number;
  customVadThreshold?: number;
  customChannels?: 1 | 2;
  customFrameMs?: 20 | 40 | 60;
  customComplexity?: number;
}

interface OpusCodec {
  decode(buffer: Uint8Array): Uint8Array;
  delete(): void;
}

const GAINS_STORAGE_KEY = 'wavvon.voice_gains';

export class VoiceWtSession {
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private captureNode: AudioWorkletNode | null = null;
  /** Owns the WebTransport session, Opus encode, seal, the speaking detector
   *  and soundboard mixing — everything between capture and the wire. Nothing
   *  on the main thread sits in the send path; inbound datagrams are handed
   *  back here for the (unchanged) receive side. */
  private encodeWorker: Worker | null = null;
  private decoder: OpusCodec | null = null;
  private captureStats: CaptureStats = INITIAL_CAPTURE_STATS;
  private muted = false;
  private deafened = false;
  private closed = false;
  private gainNodes: Map<number, GainNode> = new Map();
  private senderIdToPubkey: Map<number, string> = new Map();
  /** Per-sender playout clock: when that sender's last scheduled
   *  frame ends. Cleared when they leave, so a rejoin does not
   *  inherit a stale future timestamp and start out silent. */
  private playoutEnd: Map<number, number> = new Map();
  /** Per-sender inbound loss trackers, keyed by sender id. Fed from the
   *  cleartext `ctr` in each packet header, so gaps are visible without
   *  decrypting anything. */
  private lossBySender: Map<number, LossTracker> = new Map();
  private savedGains: Record<string, number>;
  private zones: Map<string, VoiceZone> = new Map();
  private myPubkey: string;
  private activeClipId: string | null = null;
  private channelId: string;
  private keys: VoiceKeyManager;
  private replayGuard = new ReplayGuard();

  constructor(
    private join: VoiceJoinInfo,
    private handlers: VoiceSessionHandlers,
    private audioConfig?: AudioProfileConfig,
    myPubkey?: string,
    ownSeedHex?: string,
    private fetchDhKey: (pubkey: string) => Promise<string | null> = async () => null,
    // See VoiceKeyManager: resolveDmSendAttribution(identity).dhPriv — the
    // canonical DH scalar on a paired device, seed-derived otherwise.
    ownDhPriv?: Uint8Array,
  ) {
    this.myPubkey = myPubkey ?? "";
    this.channelId = join.channelId;
    this.keys = new VoiceKeyManager(join.channelId, ownSeedHex ?? "", this.fetchDhKey, ownDhPriv);
    this.handleRosterUpdate(join.participants);
    try {
      this.savedGains = JSON.parse(getScoped(GAINS_STORAGE_KEY) || '{}') as Record<string, number>;
    } catch {
      this.savedGains = {};
    }
  }

  async start(): Promise<void> {
    const opus = resolveOpusConfig(this.audioConfig);

    this.decoder = new OpusScript(48000, opus.channels, OpusScript.Application.VOIP, { wasm: false }) as unknown as OpusCodec;

    // Honors the user's chosen input device (Settings → Voice), if any, and
    // states the processing constraints rather than inheriting whatever this
    // browser defaults to — see micCapture.ts.
    this.mediaStream = await captureMic();

    this.audioCtx = new AudioContext({ sampleRate: CAPTURE_SAMPLE_RATE });
    // Route playback to the chosen output device where supported (Chrome 110+).
    try {
      const outputId = localStorage.getItem("wavvon.audioOutputDevice");
      const ctx = this.audioCtx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
      if (outputId && typeof ctx.setSinkId === "function") {
        await ctx.setSinkId(outputId).catch(() => { /* device gone — fall back to default */ });
      }
    } catch { /* setSinkId unsupported */ }
    await this.audioCtx.audioWorklet.addModule(captureWorkletUrl);
    const source = this.audioCtx.createMediaStreamSource(this.mediaStream);
    this.captureNode = new AudioWorkletNode(this.audioCtx, 'wavvon-capture');
    source.connect(this.captureNode);
    // Pulled only while connected downstream; the node writes no output.
    this.captureNode.connect(this.audioCtx.destination);

    const url = `${this.join.wtUrl}?token=${encodeURIComponent(this.join.token)}`;
    const certHash = this.join.certHash;
    await this.startEncodeWorker(opus, url, certHash ? new Uint8Array(hexToBytes(certHash)) : null);

    // Seal outgoing frames with our own key from the moment capture starts —
    // no need to wait on the (async, network-bound) key offer below, since
    // sealing only needs the locally-generated key.
    const others = this.join.participants
      .filter((p) => p.public_key !== this.myPubkey)
      .map((p) => p.public_key);
    void this.offerKeyTo(others);

    this.handlers.onReady(this.join.senderId, this.join.participants, this.join.channelId);
  }

  private onDatagram(data: Uint8Array): void {
    if (this.deafened || !this.decoder) return;

    const frame = parseDownlinkDatagram(data);
    if (!frame) return;
    const senderPubkey = this.senderIdToPubkey.get(frame.senderId);
    if (!senderPubkey) return;

    let opened: { ctr: bigint; ts: number; opus: Uint8Array };
    try {
      const keyId = peekSealedKeyId(frame.sealed);
      const remoteKey = this.keys.lookupKey(senderPubkey, keyId);
      if (!remoteKey) return; // unknown (sender, key_id) — drop silently
      opened = voicePacketOpen(remoteKey.key, remoteKey.salt, frame.sealed);
      if (!this.replayGuard.accept(frame.senderId, keyId, opened.ctr)) return;
    } catch {
      return;
    }

    let pcm: Uint8Array;
    try {
      pcm = this.decoder.decode(opened.opus);
    } catch {
      return;
    }

    this.lossBySender.set(
      frame.senderId,
      trackPacket(this.lossBySender.get(frame.senderId), opened.ctr),
    );

    this.playPcm(new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2), frame.senderId);
  }

  /** Wraps our current own key for each target and sends it as one
   *  `voice_key_offer` — used at join (all other participants), on a
   *  `voice_key_request` for a single newcomer, and after a leave-triggered
   *  rotation. Best-effort: a target whose DH key can't be resolved is
   *  silently skipped by the key manager. */
  private async offerKeyTo(targets: string[]): Promise<void> {
    if (targets.length === 0) return;
    try {
      const bundles = await this.keys.buildOffer(targets);
      if (bundles.length > 0) this.handlers.sendKeyOffer(this.channelId, bundles);
    } catch { /* best-effort */ }
  }

  /** `voice_key_received` (main WS) — store the sender's key. */
  handleKeyReceived(fromPubkey: string, ciphertextHex: string, nonceHex: string): void {
    void this.keys.receiveKey(fromPubkey, ciphertextHex, nonceHex);
  }

  /** `voice_key_request` (main WS) — a newcomer needs our current key. */
  handleKeyRequest(newPubkey: string): void {
    void this.offerKeyTo([newPubkey]);
  }

  /** `voice_participant_left` (main WS) — rotate and re-offer to whoever
   *  remains (read off our own roster map, minus the departed member and
   *  ourselves), so the departed member's cached key goes stale. */
  handleParticipantLeft(leftPubkey: string): void {
    const remaining = [...new Set(this.senderIdToPubkey.values())]
      .filter((pk) => pk !== leftPubkey && pk !== this.myPubkey);
    void this.rotateAndReoffer(remaining);
  }

  private async rotateAndReoffer(remainingPubkeys: string[]): Promise<void> {
    try {
      const bundles = await this.keys.rotate(remainingPubkeys);
      if (bundles.length > 0) this.handlers.sendKeyOffer(this.channelId, bundles);
    } catch { /* best-effort */ } finally {
      this.postToWorker({ type: 'key', key: this.workerKey() });
    }
  }

  /** Opens the transport inside the worker and resolves once it is ready,
   *  then connects the capture worklet straight to the worker's port so frames
   *  never pass through this thread. The worklet gets its port only now: audio
   *  captured before the session exists has nowhere to go and would arrive as
   *  one stale burst. */
  private startEncodeWorker(opus: ReturnType<typeof resolveOpusConfig>, url: string, certHash: Uint8Array | null): Promise<void> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./voiceEncodeWorker.ts', import.meta.url), { type: 'module' });
      this.encodeWorker = worker;
      let ready = false;
      worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const msg = e.data;
        switch (msg.type) {
          case 'ready':
            ready = true;
            this.captureNode!.port.postMessage({ pcmPort: port1 }, [port1]);
            resolve();
            break;
          case 'closed':
            if (!ready) reject(new Error('Voice transport closed before it was ready'));
            else if (!this.closed) this.handlers.onClose();
            break;
          case 'datagram':
            this.onDatagram(msg.data);
            break;
          case 'speaking':
            this.handlers.sendSpeaking(this.channelId, msg.speaking);
            break;
          case 'gate':
            this.handlers.onGateWarning?.(msg.warning);
            break;
          case 'clipDone':
            this.activeClipId = null;
            break;
          case 'stats':
            this.captureStats = msg.stats;
            break;
        }
      };
      worker.onerror = () => { if (!ready) reject(new Error('Voice worker failed to start')); };
      const { port1, port2 } = new MessageChannel();
      const init: ToWorker = {
        type: 'init',
        url,
        certHash,
        opusApp: opus.app,
        channels: opus.channels,
        vad: effectiveVad(this.audioConfig),
        muted: this.muted,
        key: this.workerKey(),
        pcmPort: port2,
      };
      worker.postMessage(init, [port2]);
    });
  }

  private workerKey() {
    const { key, salt, keyId } = this.keys.ownKey();
    return { key, salt, keyId };
  }

  private postToWorker(msg: ToWorker): void {
    this.encodeWorker?.postMessage(msg);
  }

  /** Capture-to-send health, refreshed about once a second: frames the encoder
   *  saw, frames lost on the way (gaps in the capture timeline) and frames
   *  that waited longer than 40 ms. Growth in `late` or `dropped` means the
   *  send path is falling behind. */
  getCaptureStats(): CaptureStats {
    return this.captureStats;
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

  /** Worst inbound loss across the senders we are hearing, as a percentage,
   *  or null when nothing has been received long enough to judge. The worst
   *  rather than the average: one badly-reaching participant is the thing you
   *  want to see, and averaging it against three clean streams hides it. */
  inboundLossPercent(): number | null {
    let worst: number | null = null;
    for (const tracker of this.lossBySender.values()) {
      const pct = lossPercent(tracker);
      if (pct === null) continue;
      if (worst === null || pct > worst) worst = pct;
    }
    return worst;
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

    // Scheduled, not `start()`. See voicePlayout.ts: playing each frame the
    // instant it arrives is gapless only when arrival is gapless, which is
    // true on a loopback and false across the internet.
    const at = nextPlayoutStart(this.playoutEnd.get(senderId), this.audioCtx.currentTime);
    src.start(at);
    this.playoutEnd.set(senderId, at + pcm.length / 48000);
  }

  handleRosterUpdate(participants: { sender_id: number; public_key: string }[]): void {
    const activeIds = new Set(participants.map((p) => p.sender_id));

    for (const [sid] of this.senderIdToPubkey) {
      if (!activeIds.has(sid)) {
        this.lossBySender.delete(sid);
        const gainNode = this.gainNodes.get(sid);
        if (gainNode) {
          gainNode.disconnect();
          this.gainNodes.delete(sid);
        }
        this.senderIdToPubkey.delete(sid);
        this.playoutEnd.delete(sid);
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
      setScoped(GAINS_STORAGE_KEY, JSON.stringify(stored));
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
    if (this.activeClipId) return false;
    this.activeClipId = clipId;
    this.postToWorker({ type: 'clip', samples });
    return true;
  }

  getPlayingClipId(): string | null {
    return this.activeClipId;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.postToWorker({ type: 'muted', muted });
  }

  setDeafened(deafened: boolean): void {
    this.deafened = deafened;
    if (deafened) {
      this.setMuted(true);
    }
  }

  stop(): void {
    this.closed = true;
    this.captureNode?.disconnect();
    this.captureNode = null;
    this.postToWorker({ type: 'stop' });
    this.encodeWorker = null;
    for (const track of this.mediaStream?.getTracks() ?? []) track.stop();
    this.mediaStream = null;
    for (const [, gainNode] of this.gainNodes) {
      gainNode.disconnect();
    }
    this.gainNodes.clear();
    this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
    this.decoder?.delete();
    this.decoder = null;
  }
}
