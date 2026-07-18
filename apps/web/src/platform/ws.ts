export interface WsHandlers {
  onMessage?: (m: object) => void;
  onDm?: (m: object) => void;
  onDmMemberChanged?: (e: object) => void;
  onTyping?: (e: object) => void;
  onVoiceState?: (e: object) => void;
  onVideo?: (e: object) => void;
  onWhisper?: (e: object) => void;
  onVoiceZoneCreated?: (e: object) => void;
  onVoiceZoneDestroyed?: (e: object) => void;
  onVoicePositionUpdated?: (e: object) => void;
  onVoiceZoneState?: (e: object) => void;
  onScreenShare?: (e: object) => void;
  onScreenShareChunk?: (streamId: string, isInit: boolean, data: ArrayBuffer) => void;
  onStatusChange?: (connected: boolean, hubId: string) => void;
  onPin?: (e: object) => void;
  onPoll?: (e: object) => void;
  onSoundboardPlayed?: (e: object) => void;
  onError?: (e: object) => void;
  onReauthNeeded?: (hubId: string) => void;
  onChannelsUpdated?: (hubId: string) => void;
  onMemberOnline?: (publicKey: string, hubId: string) => void;
  onMemberOffline?: (publicKey: string, hubId: string) => void;
  onMemberUpdated?: (
    publicKey: string,
    displayName: string | null,
    avatar: string | null,
    hubId: string,
  ) => void;
  /** Presence status changed: status is null (online), "away", or "dnd". */
  onMemberStatus?: (
    publicKey: string,
    status: string | null,
    custom: string | null,
    hubId: string,
  ) => void;
  onBotApp?: (e: object) => void;
  /** Hub-pushed voice_move (events.md §7.1) — targeted-by-pubkey, like whisper. */
  onVoiceMove?: (e: object) => void;
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
    if (type === "message" || type === "message_edited" || type === "message_deleted" || type === "reactions_updated" || type === "forum_event") {
      this.handlers.onMessage?.(tagged);
    } else if (type === "dm") {
      this.handlers.onDm?.(tagged);
    } else if (type === "dm_member_changed") {
      this.handlers.onDmMemberChanged?.(tagged);
    } else if (type === "typing" || type === "dm_typing") {
      this.handlers.onTyping?.(tagged);
    } else if (type === "voice_whisper_started" || type === "voice_whisper_stopped") {
      // Whisper started/stopped carry only sender_pubkey (no channel_id).
      this.handlers.onWhisper?.(tagged);
    } else if (
      type === "video_participant_enabled" || type === "video_participant_disabled" || type === "video_participants" ||
      type === "video_offer_in" || type === "video_answer_in" || type === "video_ice_in"
    ) {
      this.handlers.onVideo?.(tagged);
    } else if (
      type === "voice_joined" || type === "voice_participant_joined" || type === "voice_participant_left" ||
      type === "voice_participant_speaking" || type === "voice_roster_update"
    ) {
      this.handlers.onVoiceState?.(tagged);
    } else if (type === "screen_share_chunk") {
      const env = tagged as unknown as { stream_id: string; is_init: boolean };
      this.pendingChunkEnvelope = { stream_id: env.stream_id, is_init: env.is_init };
    } else if (
      type === "screen_share_started" || type === "screen_share_stopped" ||
      type === "screen_share_offer_in" || type === "screen_share_answer_in" || type === "screen_share_ice_in" ||
      type === "screen_share_viewer_joined" || type === "screen_share_viewer_left" ||
      type === "stream_subscribed" || type === "stream_subscription_ended" || type === "hub_streams"
    ) {
      this.handlers.onScreenShare?.(tagged);
    } else if (type === "message_pinned" || type === "message_unpinned") {
      this.handlers.onPin?.(tagged);
    } else if (type === "poll_vote_updated") {
      this.handlers.onPoll?.(tagged);
    } else if (type === "soundboard_played") {
      this.handlers.onSoundboardPlayed?.(tagged);
    } else if (type === "error") {
      this.handlers.onError?.(tagged);
    } else if (type === "lagged") {
      this.handlers.onChannelsUpdated?.(this.hub_id);
    } else if (type === "channels_updated") {
      this.handlers.onChannelsUpdated?.(this.hub_id);
    } else if (type === "member_online") {
      this.handlers.onMemberOnline?.(tagged.public_key as string, this.hub_id);
    } else if (type === "member_offline") {
      this.handlers.onMemberOffline?.(tagged.public_key as string, this.hub_id);
    } else if (type === "member_updated") {
      this.handlers.onMemberUpdated?.(
        tagged.public_key as string,
        (tagged.display_name as string | null) ?? null,
        (tagged.avatar as string | null) ?? null,
        this.hub_id,
      );
    } else if (type === "member_status") {
      this.handlers.onMemberStatus?.(
        tagged.public_key as string,
        (tagged.status as string | null) ?? null,
        (tagged.custom as string | null) ?? null,
        this.hub_id,
      );
    } else if (type === "bot_app_launch" || type === "bot_app_open" || type === "bot_app_close") {
      this.handlers.onBotApp?.(tagged);
    } else if (type === "voice_zone_created") {
      this.handlers.onVoiceZoneCreated?.(tagged);
    } else if (type === "voice_zone_destroyed") {
      this.handlers.onVoiceZoneDestroyed?.(tagged);
    } else if (type === "voice_position_updated") {
      this.handlers.onVoicePositionUpdated?.(tagged);
    } else if (type === "voice_zone_state") {
      this.handlers.onVoiceZoneState?.(tagged);
    } else if (type === "voice_move") {
      this.handlers.onVoiceMove?.(tagged);
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

  // Send a raw binary frame (screen-share chunk payload). The hub pairs it
  // with the immediately-preceding `screen_share_chunk` JSON envelope, so
  // callers must send() the envelope first, then sendBinary() the bytes.
  sendBinary(data: ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
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

  // --- Camera video signaling (full-mesh WebRTC, main WS) ---
  sendVideoEnable(channelId: string): void {
    this.send({ type: "video_enable", channel_id: channelId });
  }
  sendVideoDisable(channelId: string): void {
    this.send({ type: "video_disable", channel_id: channelId });
  }
  sendVideoOffer(channelId: string, toPubkey: string, sdp: string): void {
    this.send({ type: "video_offer", channel_id: channelId, to_pubkey: toPubkey, sdp });
  }
  sendVideoAnswer(channelId: string, toPubkey: string, sdp: string): void {
    this.send({ type: "video_answer", channel_id: channelId, to_pubkey: toPubkey, sdp });
  }
  sendVideoIce(channelId: string, toPubkey: string, candidate: string): void {
    this.send({ type: "video_ice", channel_id: channelId, to_pubkey: toPubkey, candidate });
  }

  // --- Whisper control (main WS) ---
  startWhisper(targets: { type: string; id: string }[]): void {
    this.send({ type: "voice_whisper_start", targets });
  }
  stopWhisper(): void {
    this.send({ type: "voice_whisper_stop" });
  }

  // --- Voice move (main WS, events.md §7.1) — no event_id in Phase 1 UI. ---
  sendVoiceMove(targetPubkey: string, targetChannelId: string): void {
    this.send({ type: "voice_move", target_pubkey: targetPubkey, target_channel_id: targetChannelId });
  }

  // --- Hub-streams (cross-channel screen-share discovery/subscribe) ---
  requestStreamList(): void {
    this.send({ type: "stream_list" });
  }
  subscribeStream(sourceChannelId: string, streamId: string): void {
    this.send({ type: "stream_subscribe", source_channel_id: sourceChannelId, stream_id: streamId });
  }
  unsubscribeStream(sourceChannelId: string, streamId: string): void {
    this.send({ type: "stream_unsubscribe", source_channel_id: sourceChannelId, stream_id: streamId });
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
