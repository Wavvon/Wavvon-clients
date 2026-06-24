export interface WsHandlers {
  onMessage?: (m: object) => void;
  onDm?: (m: object) => void;
  onTyping?: (e: object) => void;
  onVoiceState?: (e: object) => void;
  onScreenShare?: (e: object) => void;
  onStatusChange?: (connected: boolean) => void;
}

const BACKOFF_INITIAL = 1000;
const BACKOFF_CAP = 30_000;

export class HubWebSocket {
  private ws: WebSocket | null = null;
  private closed = false;
  private backoff = BACKOFF_INITIAL;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private hub_url: string,
    private token: string,
    private handlers: WsHandlers,
  ) {
    this.connect();
  }

  private get wsUrl(): string {
    const base = this.hub_url
      .replace(/^http:\/\//, "ws://")
      .replace(/^https:\/\//, "wss://");
    return `${base}/ws?token=${encodeURIComponent(this.token)}`;
  }

  private connect(): void {
    if (this.closed) return;
    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      this.backoff = BACKOFF_INITIAL;
      this.handlers.onStatusChange?.(true);
    };

    this.ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data as string) as Record<string, unknown>;
      } catch {
        return;
      }
      this.dispatch(msg);
    };

    this.ws.onclose = () => {
      this.handlers.onStatusChange?.(false);
      if (!this.closed) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private dispatch(msg: Record<string, unknown>): void {
    const type = msg.type as string | undefined;
    if (type === "message" || type === "message_edited" || type === "message_deleted" || type === "reactions_updated") {
      this.handlers.onMessage?.(msg);
    } else if (type === "dm") {
      this.handlers.onDm?.(msg);
    } else if (type === "typing" || type === "dm_typing") {
      this.handlers.onTyping?.(msg);
    } else if (type === "voice_joined" || type === "voice_participant_joined" || type === "voice_participant_left" || type === "voice_participant_speaking") {
      this.handlers.onVoiceState?.(msg);
    } else if (
      type === "screen_share_started" ||
      type === "screen_share_chunk" ||
      type === "screen_share_stopped"
    ) {
      this.handlers.onScreenShare?.(msg);
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    this.retryTimer = setTimeout(() => {
      this.connect();
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 2, BACKOFF_CAP);
  }

  send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  subscribeChannel(channelId: string): void {
    this.send({ type: "subscribe", channel_id: channelId });
  }

  unsubscribeChannel(channelId: string): void {
    this.send({ type: "unsubscribe", channel_id: channelId });
  }

  close(): void {
    this.closed = true;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
  }
}
