import { useMemo, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTypingIndicators as useSharedTyping } from "@wavvon/ui";
import type { Channel, Conversation } from "../types";

export type { TypingMap } from "@wavvon/ui";

// Desktop's half of the shared typing hook: the Tauri shell for sending. The
// receive side stays in useWsHandlers, which turns each `chat-typing` /
// `dm-typing` event into a setTyping / clearTyping call.
export function useTypingIndicators(
  selectedChannelRef: RefObject<Channel | null>,
  selectedConversationRef: RefObject<Conversation | null>,
) {
  const deps = useMemo(
    () => ({
      getChannelId: () => selectedChannelRef.current?.id,
      getConversationId: () => selectedConversationRef.current?.id,
      sendTyping: (channelId: string, typing: boolean) => {
        invoke("set_typing", { channelId, typing }).catch(() => {});
      },
      sendDmTyping: (conversationId: string, typing: boolean) => {
        invoke("set_dm_typing", { conversationId, typing }).catch(() => {});
      },
    }),
    [selectedChannelRef, selectedConversationRef],
  );

  return useSharedTyping(deps);
}
