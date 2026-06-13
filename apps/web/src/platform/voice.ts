import OpusScript from 'opusscript';

export interface VoiceSessionHandlers {
  onReady: (senderId: number, participants: unknown[]) => void;
  onClose: () => void;
}

interface OpusCodec {
  encode(buffer: Uint8Array, frameSize: number): Uint8Array;
  decode(buffer: Uint8Array): Uint8Array;
  delete(): void;
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

  constructor(
    private hubUrl: string,
    private token: string,
    private channelId: string,
    private handlers: VoiceSessionHandlers,
  ) {}

  async start(): Promise<void> {
    this.encoder = new OpusScript(48000, 1, OpusScript.Application.VOIP) as unknown as OpusCodec;
    this.decoder = new OpusScript(48000, 1, OpusScript.Application.VOIP) as unknown as OpusCodec;

    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    this.audioCtx = new AudioContext({ sampleRate: 48000 });
    const source = this.audioCtx.createMediaStreamSource(this.mediaStream);
    this.processor = this.audioCtx.createScriptProcessor(960, 1, 1);
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
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32767));
    }

    let opusBytes: Uint8Array;
    try {
      opusBytes = this.encoder.encode(new Uint8Array(int16.buffer), 960);
    } catch {
      return;
    }

    const packet = new ArrayBuffer(6 + opusBytes.length);
    const view = new DataView(packet);
    view.setUint16(0, this.sequence & 0xffff, false);
    view.setUint32(2, this.timestamp & 0xffffffff, false);
    new Uint8Array(packet, 6).set(opusBytes);
    this.sequence++;
    this.timestamp += 960;
    this.ws.send(packet);
  }

  private onWsMessage(ev: MessageEvent): void {
    if (typeof ev.data === 'string') {
      try {
        const msg = JSON.parse(ev.data) as Record<string, unknown>;
        if (msg.type === 'voice_ws_ready') {
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
    const packetType = data[2];
    if (packetType !== 0x00) return;
    const opusBytes = data.slice(9);

    let pcm: Uint8Array;
    try {
      pcm = this.decoder.decode(opusBytes);
    } catch {
      return;
    }

    this.playPcm(new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2));
  }

  private playPcm(pcm: Int16Array): void {
    if (!this.audioCtx) return;
    const buffer = this.audioCtx.createBuffer(1, pcm.length, 48000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) {
      channel[i] = pcm[i] / 32767;
    }
    const src = this.audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.audioCtx.destination);
    src.start();
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
    this.processor?.disconnect();
    this.processor = null;
    for (const track of this.mediaStream?.getTracks() ?? []) track.stop();
    this.mediaStream = null;
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
