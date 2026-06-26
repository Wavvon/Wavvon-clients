import { useEffect, type RefObject } from "react";
import { listen } from "@tauri-apps/api/event";
import { formatPubkey } from "@voxply/core";
import type { DmMessage, VoiceParticipant, Conversation, User, BotAppLaunchEvent, BotAppOpenEvent, BotAppCloseEvent } from "../types";

export interface WsHandlersParams {
  activeHubIdRef: RefObject<string | null>;
  publicKeyRef: RefObject<string | null>;
  selectedChannelIdRef: RefObject<string | null>;
  selectedConversationIdRef: RefObject<string | null>;
  users: User[];
  setHubConnected: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setAssertiveAnnouncement: (msg: string) => void;
  setToast: (msg: string) => void;
  setTypingEntry: (key: string, name: string) => void;
  clearTypingEntry: (key: string) => void;
  setDmTypingEntry: (key: string, name: string) => void;
  clearDmTypingEntry: (key: string) => void;
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
  onBotAppLaunch: (event: BotAppLaunchEvent) => void;
  onBotAppOpen: (event: BotAppOpenEvent, hubUrl: string) => void;
  onBotAppClose: (event: BotAppCloseEvent) => void;
}

export function useWsHandlers({
  activeHubIdRef,
  publicKeyRef,
  selectedChannelIdRef,
  selectedConversationIdRef,
  users,
  setHubConnected,
  setAssertiveAnnouncement,
  setToast,
  setTypingEntry,
  clearTypingEntry,
  setDmTypingEntry,
  clearDmTypingEntry,
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
              onHubReconnected(hub_id);
            } else {
              scheduleReconnect(hub_id);
            }
          }
        )
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
            setDmTypingEntry(event.payload.sender, name);
          } else {
            clearDmTypingEntry(event.payload.sender);
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
            setTypingEntry(event.payload.public_key, name);
          } else {
            clearTypingEntry(event.payload.public_key);
          }
        })
      );

      unlistens.push(
        await listen<{
          hub_id: string;
          channel_id: string;
          hub_udp_port: number;
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
        await listen<BotAppLaunchEvent & { hub_id: string }>("bot-app-launch", (event) => {
          if (event.payload.hub_id !== activeHubIdRef.current) return;
          const { hub_id: _hub_id, ...ev } = event.payload;
          onBotAppLaunch(ev as BotAppLaunchEvent);
        })
      );

      unlistens.push(
        await listen<BotAppOpenEvent & { hub_id: string }>("bot-app-open", (event) => {
          if (event.payload.hub_id !== activeHubIdRef.current) return;
          const hubId = event.payload.hub_id;
          const hubUrl = hubs.find((h) => h.hub_id === hubId)?.hub_url ?? "";
          const { hub_id: _hub_id, ...ev } = event.payload;
          onBotAppOpen(ev as BotAppOpenEvent, hubUrl);
        })
      );

      unlistens.push(
        await listen<BotAppCloseEvent & { hub_id: string }>("bot-app-close", (event) => {
          if (event.payload.hub_id !== activeHubIdRef.current) return;
          const { hub_id: _hub_id, ...ev } = event.payload;
          onBotAppClose(ev as BotAppCloseEvent);
        })
      );
    })();

    return () => {
      unlistens.forEach((u) => u());
      cancelAllReconnectTimers();
    };
  }, []);
}
