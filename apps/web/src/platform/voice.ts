import OpusScript from 'opusscript';

export interface VoiceSessionHandlers {
  onReady: (senderId: number, participants: unknown[]) => void;
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

  constructor(
    private hubUrl: string,
    private token: string,
    private channelId: string,
    private handlers: VoiceSessionHandlers,
    private audioConfig?: AudioProfileConfig,
  ) {
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

    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    this.audioCtx = new AudioContext({ sampleRate: 48000 });
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

    const float32 = e.inputBuffer.getChannelData(0);
    let offset = 0;

    while (offset < float32.length) {
      const space = OPUS_FRAME_SIZE - this.sampleAccumLen;
      const take = Math.min(space, float32.length - offset);
      for (let i = 0; i < take; i++) {
        this.sampleAccum[this.sampleAccumLen + i] = Math.max(-32768, Math.min(32767, float32[offset + i] * 32767));
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
          this.handlers.onReady(
            msg.sender_id as number,
            msg.participants as unknown[],
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
    if (packetType !== 0x00) return;
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
