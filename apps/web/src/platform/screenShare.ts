import type { HubWebSocket } from "./ws";

// Outbound screen share over the hub's chunk-relay protocol — the same wire
// messages the desktop client sends (useScreenShare.ts) and the existing web
// viewer (ScreenShareViewer) consumes: a `screen_share_start`, then per
// MediaRecorder blob a `screen_share_chunk` JSON envelope immediately
// followed by a raw binary frame, then `screen_share_stop`.

const MIME_CANDIDATES = [
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8",
  "video/webm",
];

function pickMime(): string {
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "video/webm";
}

// crypto.randomUUID needs a secure context; localhost qualifies. Fall back
// just in case so a share never fails on id generation.
function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}

export interface ScreenShareHandlers {
  /** Fired with a rolling kbps estimate as chunks are sent. */
  onBitrate?: (kbps: number) => void;
  /** Fired when the share ends (user clicked stop, or stopped via the browser's own control). */
  onEnded?: () => void;
  onError?: (message: string) => void;
}

export class WebScreenShareSession {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private seq = 0;
  private firstChunk = true;
  private stopped = false;
  private bytesInWindow = 0;
  private windowStart = 0;
  readonly streamId = randomId();

  constructor(
    private ws: HubWebSocket,
    private channelId: string,
    private handlers: ScreenShareHandlers = {},
  ) {}

  // Prompts the browser's screen picker, then starts recording + relaying.
  // Throws if the user cancels the picker or capture fails (caller shows it).
  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 60 }, width: { max: 1920 }, height: { max: 1080 } },
      audio: true,
    });
    this.stream = stream;
    const hasAudio = stream.getAudioTracks().length > 0;
    const mime = pickMime();

    // The hub relays start-before-first-chunk; subscribe so we also receive
    // our own stream events, matching the desktop path.
    this.ws.subscribeChannel(this.channelId);
    this.ws.send({
      type: "screen_share_start",
      channel_id: this.channelId,
      stream_id: this.streamId,
      kind: "screen",
      mime,
      has_audio: hasAudio,
      transport: "chunks",
    });

    // If the user stops sharing via the browser's native control, end cleanly.
    stream.getVideoTracks()[0]?.addEventListener("ended", () => this.stop());

    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    this.recorder = recorder;
    this.windowStart = performance.now();
    recorder.ondataavailable = async (e) => {
      if (this.stopped || e.data.size === 0) return;
      try {
        const buf = await e.data.arrayBuffer();
        this.ws.send({
          type: "screen_share_chunk",
          channel_id: this.channelId,
          stream_id: this.streamId,
          seq: this.seq++,
          is_init: this.firstChunk,
        });
        this.ws.sendBinary(buf);
        this.firstChunk = false;
        this.trackBitrate(buf.byteLength);
      } catch (err) {
        this.handlers.onError?.(String(err));
      }
    };
    recorder.start(250);
  }

  private trackBitrate(bytes: number): void {
    this.bytesInWindow += bytes;
    const now = performance.now();
    const elapsed = now - this.windowStart;
    if (elapsed >= 1000) {
      const kbps = Math.round((this.bytesInWindow * 8) / elapsed);
      this.handlers.onBitrate?.(kbps);
      this.bytesInWindow = 0;
      this.windowStart = now;
    }
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    try {
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    } catch { /* already stopped */ }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ws.send({
      type: "screen_share_stop",
      channel_id: this.channelId,
      stream_id: this.streamId,
    });
    this.handlers.onEnded?.();
  }
}
