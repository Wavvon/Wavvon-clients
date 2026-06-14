export interface WsHandlers {
  onMessage?: (m: object) => void;
  onDm?: (m: object) => void;
  onDmMemberChanged?: (e: object) => void;
  onTyping?: (e: object) => void;
  onVoiceState?: (e: object) => void;
  onScreenShare?: (e: object) => void;
  onScreenShareChunk?: (streamId: string, isInit: boolean, data: ArrayBuffer) => void;
  onStatusChange?: (connected: boolean, hubId: string) => void;
  onPin?: (e: object) => void;
  onPoll?: (e: object) => void;
  onError?: (e: object) => void;
  onReauthNeeded?: (hubId: string) => void;
  onChannelsUpdated?: (hubId: string) => void;
  onMemberOnline?: (publicKey: string, hubId: string) => void;
  onMemberOffline?: (publicKey: string, hubId: string) => void;
}

const BACKOFF_INITIAL = 1000;
const BACKOFF_CAP = 30_000;
const REAUTH_AFTER_FAILURES = 3;

export class HubWebSocket {
  private ws: WebSocket | null = null;
  private closed = false;
  private backoff = BACKOFF_INITIAL;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveFailures = 0;
  private pendingChunkEnvelope: { stream_id: string; is_init: boolean } | null = null;

  constructor(
    private hub_url: string,
    private token: string,
    private hub_id: string,
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
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      this.backoff = BACKOFF_INITIAL;
      this.consecutiveFailures = 0;
      this.handlers.onStatusChange?.(true, this.hub_id);
    };

    this.ws.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        if (this.pendingChunkEnvelope) {
          this.handlers.onScreenShareChunk?.(
            this.pendingChunkEnvelope.stream_id,
            this.pendingChunkEnvelope.is_init,
            ev.data,
          );
          this.pendingChunkEnvelope = null;
        }
        return;
      }
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data as string) as Record<string, unknown>;
      } catch {
        return;
      }
      this.dispatch(msg);
    };

    this.ws.onclose = () => {
      this.pendingChunkEnvelope = null;
      this.handlers.onStatusChange?.(false, this.hub_id);
      if (!this.closed) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.pendingChunkEnvelope = null;
      this.ws?.close();
    };
  }

  private dispatch(msg: Record<string, unknown>): void {
    const tagged: Record<string, unknown> = { ...msg, _hub_id: this.hub_id };
    const type = tagged.type as string | undefined;
    if (type === "message" || type === "message_edited" || type === "message_deleted" || type === "reactions_updated") {
      this.handlers.onMessage?.(tagged);
    } else if (type === "dm") {
      this.handlers.onDm?.(tagged);
    } else if (type === "dm_member_changed") {
      this.handlers.onDmMemberChanged?.(tagged);
    } else if (type === "typing" || type === "dm_typing") {
      this.handlers.onTyping?.(tagged);
    } else if (type === "voice_joined" || type === "voice_participant_joined" || type === "voice_participant_left" || type === "voice_participant_speaking" || type === "voice_roster_update") {
      this.handlers.onVoiceState?.(tagged);
    } else if (type === "screen_share_chunk") {
      const env = tagged as unknown as { stream_id: string; is_init: boolean };
      this.pendingChunkEnvelope = { stream_id: env.stream_id, is_init: env.is_init };
    } else if (type === "screen_share_started" || type === "screen_share_stopped") {
      this.handlers.onScreenShare?.(tagged);
    } else if (type === "message_pinned" || type === "message_unpinned") {
      this.handlers.onPin?.(tagged);
    } else if (type === "poll_vote_updated") {
      this.handlers.onPoll?.(tagged);
    } else if (type === "error") {
      this.handlers.onError?.(tagged);
    } else if (type === "channels_updated") {
      this.handlers.onChannelsUpdated?.(this.hub_id);
    } else if (type === "member_online") {
      this.handlers.onMemberOnline?.(tagged.public_key as string, this.hub_id);
    } else if (type === "member_offline") {
      this.handlers.onMemberOffline?.(tagged.public_key as string, this.hub_id);
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= REAUTH_AFTER_FAILURES && this.handlers.onReauthNeeded) {
      this.handlers.onReauthNeeded(this.hub_id);
      return;
    }
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

  watchVoice(channelId: string): void {
    this.send({ type: "voice_watch", channel_id: channelId });
  }

  unwatchVoice(): void {
    this.send({ type: "voice_unwatch" });
  }

  close(): void {
    this.closed = true;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
  }
}
