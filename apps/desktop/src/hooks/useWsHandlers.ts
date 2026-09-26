import { useEffect, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { formatPubkey } from "@wavvon/core";
import type { DmMessage, VoiceParticipant, Conversation, User, AppLaunchEvent, AppOpenEvent, AppCloseEvent, PresenceStatus } from "../types";

export interface WsHandlersParams {
  activeHubIdRef: RefObject<string | null>;
  publicKeyRef: RefObject<string | null>;
  selectedChannelIdRef: RefObject<string | null>;
  selectedConversationIdRef: RefObject<string | null>;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  myPresenceRef: RefObject<{ status: PresenceStatus }>;
  /// Current whisper receive opt-out, re-pushed on every (re)connect.
  whisperOptoutRef: RefObject<boolean>;
  onVoiceMove: (raw: unknown) => void;
  setHubConnected: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setAssertiveAnnouncement: (msg: string) => void;
  setToast: (msg: string) => void;
  setTyping: (scopeId: string, pubkey: string, name: string) => void;
  clearTyping: (scopeId: string, pubkey: string) => void;
  setDmTyping: (scopeId: string, pubkey: string, name: string) => void;
  clearDmTyping: (scopeId: string, pubkey: string) => void;
  onDmEvent: (conversationId: string, msg: DmMessage, hubId: string) => void;
  onDmMemberChanged: (payload: {
    hub_id: string;
    conversation_id: string;
    added: string[];
    removed: string[];
  }) => void;
  onHubReconnected: (hubId: string) => void;
  scheduleReconnect: (hubId: string) => void;
  cancelAllReconnectTimers: () => void;
  onVoiceJoined: (channelId: string, participants: VoiceParticipant[]) => void;
  onParticipantJoined: (channelId: string, participant: VoiceParticipant) => void;
  onParticipantLeft: (channelId: string, pubkey: string) => void;
  onMicLevel: (level: number) => void;
  onHubErrorVoiceJoin: () => Promise<void>;
  pendingVoiceAnnouncementsRef: RefObject<string[]>;
  voiceAnnounceTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  setVoicePoliteAnnouncement: (msg: string) => void;
  hubs: { hub_id: string; hub_name: string; hub_url: string }[];
  channelsRef: RefObject<{ id: string; name: string }[]>;
  onBotAppLaunch: (event: AppLaunchEvent) => void;
  onBotAppOpen: (event: AppOpenEvent, hubUrl: string) => void;
  onBotAppClose: (event: AppCloseEvent) => void;
  /// The hub's channel list changed (`channels_updated`).
  onChannelsChanged: () => void;
  /// Hub branding/settings changed (`hub_updated`) — name, icon, timezone.
  onHubBrandingChanged: () => void;
  /// A `soundboard_played` payload, forwarded raw to the shared chip hook.
  onSoundboardPlayed: (raw: unknown) => void;
}

export function useWsHandlers({
  activeHubIdRef,
  publicKeyRef,
  selectedChannelIdRef,
  selectedConversationIdRef,
  users,
  setUsers,
  myPresenceRef,
  whisperOptoutRef,
  setHubConnected,
  setAssertiveAnnouncement,
  setToast,
  setTyping,
  clearTyping,
  setDmTyping,
  clearDmTyping,
  onDmEvent,
  onDmMemberChanged,
  onHubReconnected,
  scheduleReconnect,
  cancelAllReconnectTimers,
  onVoiceJoined,
  onParticipantJoined,
  onParticipantLeft,
  onMicLevel,
  onHubErrorVoiceJoin,
  pendingVoiceAnnouncementsRef,
  voiceAnnounceTimerRef,
  setVoicePoliteAnnouncement,
  hubs,
  channelsRef,
  onBotAppLaunch,
  onBotAppOpen,
  onBotAppClose,
  onVoiceMove,
  onChannelsChanged,
  onHubBrandingChanged,
  onSoundboardPlayed,
}: WsHandlersParams) {
  useEffect(() => {
    const unlistens: (() => void)[] = [];

    (async () => {
      unlistens.push(
        await listen<{ hub_id: string; connected: boolean }>(
          "hub-ws-status",
          (event) => {
            const { hub_id, connected } = event.payload;
            setHubConnected((prev) => {
              const was = prev[hub_id];
              const next = { ...prev, [hub_id]: connected };
              if (hub_id === activeHubIdRef.current) {
                const hubName = hubs.find((h) => h.hub_id === hub_id)?.hub_name ?? "hub";
                if (connected && was === false) {
                  setToast("Reconnected");
                  setAssertiveAnnouncement(`Reconnected to ${hubName}.`);
                } else if (!connected && was !== false) {
                  setAssertiveAnnouncement(`Disconnected from ${hubName}. Reconnecting…`);
                }
              }
              return next;
            });
            if (connected) {
              // Presence is global: push this device's status to the hub that
              // just (re)connected, but only if the user ever picked one here —
              // a fresh device must not stomp a status set elsewhere.
              const p = myPresenceRef.current;
              if (p && p.status !== "online") {
                invoke("send_hub_ws_raw_to", {
                  hubId: hub_id,
                  payload: JSON.stringify({ type: "set_status", status: p.status, custom: null }),
                }).catch(() => { /* session raced away */ });
              }
              // Whisper opt-out is held per-connection by the hub, so a
              // reconnect silently re-opts us in unless it is re-sent — same
              // reasoning as the presence push above.
              if (whisperOptoutRef.current) {
                invoke("send_hub_ws_raw_to", {
                  hubId: hub_id,
                  payload: JSON.stringify({ type: "voice_whisper_optout", enabled: true }),
                }).catch(() => { /* session raced away */ });
              }
              onHubReconnected(hub_id);
            } else {
              scheduleReconnect(hub_id);
            }
          }
        )
      );

      // Four hub events desktop modelled nowhere until 2026-08-08 — they were
      // swallowed by the WS enum's catch-all arm, so desktop showed a stale
      // hub name, a stale channel list, stale member names/avatars and no
      // soundboard attribution while web handled all four.
      unlistens.push(
        await listen<{ hub_id: string }>("hub-updated", (event) => {
          if (event.payload.hub_id !== activeHubIdRef.current) return;
          onHubBrandingChanged();
        })
      );

      unlistens.push(
        await listen<{ hub_id: string }>("channels-updated", (event) => {
          if (event.payload.hub_id !== activeHubIdRef.current) return;
          onChannelsChanged();
        })
      );

      unlistens.push(
        await listen<{
          hub_id: string;
          public_key: string;
          display_name: string | null;
          avatar: string | null;
          name_color: string | null;
        }>("member-updated", (event) => {
          const p = event.payload;
          if (p.hub_id !== activeHubIdRef.current) return;
          // Patch in place so the member list and every message author (names
          // resolve from this map) refresh live. A member we've never seen
          // means our roster predates them — refetch so they appear.
          setUsers((prev) => {
            if (!prev.some((u) => u.public_key === p.public_key)) {
              invoke<User[]>("list_users").then(setUsers).catch(() => {});
              return prev;
            }
            return prev.map((u) =>
              u.public_key === p.public_key
                ? { ...u, display_name: p.display_name, avatar: p.avatar, name_color: p.name_color }
                : u,
            );
          });
        })
      );

      unlistens.push(
        await listen<{ hub_id: string }>("soundboard-played", (event) => {
          if (event.payload.hub_id !== activeHubIdRef.current) return;
          onSoundboardPlayed(event.payload);
        })
      );

      unlistens.push(
        await listen<{ hub_id: string; public_key: string; status: string | null; custom: string | null }>(
          "member-status",
          (event) => {
            if (event.payload.hub_id !== activeHubIdRef.current) return;
            setUsers((prev) =>
              prev.map((u) =>
                u.public_key === event.payload.public_key
                  ? { ...u, status: event.payload.status, status_custom: event.payload.custom }
                  : u,
              ),
            );
          }
        )
      );

      unlistens.push(
        await listen<{
          hub_id: string;
          target_channel_id?: string;
          target_channel_name?: string;
          source_channel_id?: string | null;
          event_id?: string | null;
          auto?: boolean;
        }>("voice-move", (event) => {
          if (event.payload.hub_id !== activeHubIdRef.current) return;
          onVoiceMove(event.payload);
        })
      );

      unlistens.push(
        await listen<{
          hub_id: string;
          conversation_id: string;
          sender: string;
          sender_name: string | null;
          typing: boolean;
        }>("dm-typing", (event) => {
          if (event.payload.hub_id !== activeHubIdRef.current) return;
          if (event.payload.conversation_id !== selectedConversationIdRef.current) return;
          if (event.payload.sender === publicKeyRef.current) return;
          const name = event.payload.sender_name || formatPubkey(event.payload.sender);
          if (event.payload.typing) {
            setDmTyping(event.payload.conversation_id, event.payload.sender, name);
          } else {
            clearDmTyping(event.payload.conversation_id, event.payload.sender);
          }
        })
      );

      unlistens.push(
        await listen<{
          hub_id: string;
          conversation_id: string;
          added: string[];
          removed: string[];
        }>("dm-member-changed", (event) => {
          onDmMemberChanged(event.payload);
        })
      );

      unlistens.push(
        await listen<{
          hub_id: string;
          channel_id: string;
          public_key: string;
          display_name: string | null;
          typing: boolean;
        }>("chat-typing", (event) => {
          if (event.payload.hub_id !== activeHubIdRef.current) return;
          if (event.payload.channel_id !== selectedChannelIdRef.current) return;
          if (event.payload.public_key === publicKeyRef.current) return;
          const name = event.payload.display_name || formatPubkey(event.payload.public_key);
          if (event.payload.typing) {
            setTyping(event.payload.channel_id, event.payload.public_key, name);
          } else {
            clearTyping(event.payload.channel_id, event.payload.public_key);
          }
        })
      );

      unlistens.push(
        await listen<{
          hub_id: string;
          channel_id: string;
          participants: VoiceParticipant[];
        }>("voice-joined", (event) => {
          if (event.payload.hub_id !== activeHubIdRef.current) return;
          onVoiceJoined(event.payload.channel_id, event.payload.participants);
          const channelName = channelsRef.current.find((c) => c.id === event.payload.channel_id)?.name ?? event.payload.channel_id;
          const others = event.payload.participants.filter((p) => p.public_key !== publicKeyRef.current);
          if (others.length === 0) {
            setAssertiveAnnouncement(`Joined voice in ${channelName}.`);
          } else {
            const names = others.map((p) => p.display_name || formatPubkey(p.public_key)).join(", ");
            setAssertiveAnnouncement(`Joined voice in ${channelName} with ${others.length} other ${others.length === 1 ? "participant" : "participants"}: ${names}`);
          }
        })
      );

      unlistens.push(
        await listen<{ hub_id: string; channel_id: string; participant: VoiceParticipant }>(
          "voice-participant-joined",
          (event) => {
            if (event.payload.hub_id !== activeHubIdRef.current) return;
            onParticipantJoined(event.payload.channel_id, event.payload.participant);
            if (event.payload.participant.public_key !== publicKeyRef.current) {
              const name = event.payload.participant.display_name || formatPubkey(event.payload.participant.public_key);
              pendingVoiceAnnouncementsRef.current.push(`${name} joined voice`);
              if (!voiceAnnounceTimerRef.current) {
                voiceAnnounceTimerRef.current = setTimeout(() => {
                  const batch = pendingVoiceAnnouncementsRef.current.splice(0);
                  setVoicePoliteAnnouncement(batch.join(". "));
                  voiceAnnounceTimerRef.current = null;
                }, 2000);
              }
            }
          }
        )
      );

      unlistens.push(
        await listen<{ hub_id: string; channel_id: string; public_key: string }>(
          "voice-participant-left",
          (event) => {
            if (event.payload.hub_id !== activeHubIdRef.current) return;
            onParticipantLeft(event.payload.channel_id, event.payload.public_key);
            if (event.payload.public_key !== publicKeyRef.current) {
              const u = users.find((u) => u.public_key === event.payload.public_key);
              const name = u?.display_name || formatPubkey(event.payload.public_key);
              pendingVoiceAnnouncementsRef.current.push(`${name} left voice`);
              if (!voiceAnnounceTimerRef.current) {
                voiceAnnounceTimerRef.current = setTimeout(() => {
                  const batch = pendingVoiceAnnouncementsRef.current.splice(0);
                  setVoicePoliteAnnouncement(batch.join(". "));
                  voiceAnnounceTimerRef.current = null;
                }, 2000);
              }
            }
          }
        )
      );

      unlistens.push(
        await listen<number>("mic-level", (event) => {
          onMicLevel(event.payload);
        })
      );

      unlistens.push(
        await listen<{ hub_id: string; context: string; message: string }>(
          "hub-error",
          async (event) => {
            if (event.payload.hub_id !== activeHubIdRef.current) return;
            setToast(event.payload.message);
            if (event.payload.context === "voice_join") {
              await onHubErrorVoiceJoin();
            }
          }
        )
      );

      unlistens.push(
        await listen<DmMessage & { hub_id: string; conversation_id: string }>("dm", (event) => {
          const { conversation_id, hub_id, ...msg } = event.payload;
          onDmEvent(conversation_id, msg, hub_id);
        })
      );

      unlistens.push(
        await listen<{ hub_id: string; hub_name: string }>("hub-session-lost", async (event) => {
          const { hub_name } = event.payload;
          setToast(
            `Couldn't authenticate with "${hub_name}". The hub may be offline, or you may have been banned. Use Reconnect to retry, or right-click to remove.`
          );
        })
      );

      unlistens.push(
        await listen<AppLaunchEvent & { hub_id: string }>("app-launch", (event) => {
          if (event.payload.hub_id !== activeHubIdRef.current) return;
          const { hub_id: _hub_id, ...ev } = event.payload;
          onBotAppLaunch(ev as AppLaunchEvent);
        })
      );

      unlistens.push(
        await listen<AppOpenEvent & { hub_id: string }>("app-open", (event) => {
          if (event.payload.hub_id !== activeHubIdRef.current) return;
          const hubId = event.payload.hub_id;
          const hubUrl = hubs.find((h) => h.hub_id === hubId)?.hub_url ?? "";
          const { hub_id: _hub_id, ...ev } = event.payload;
          onBotAppOpen(ev as AppOpenEvent, hubUrl);
        })
      );

      unlistens.push(
        await listen<AppCloseEvent & { hub_id: string }>("app-close", (event) => {
          if (event.payload.hub_id !== activeHubIdRef.current) return;
          const { hub_id: _hub_id, ...ev } = event.payload;
          onBotAppClose(ev as AppCloseEvent);
        })
      );
    })();

    return () => {
      unlistens.forEach((u) => u());
      cancelAllReconnectTimers();
    };
  }, []);
}
