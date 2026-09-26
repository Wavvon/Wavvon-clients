import { useMemo, useRef } from "react";
import { useTypingIndicators as useSharedTyping } from "@wavvon/ui";
import { sendTypingEvent, sendDmTypingEvent } from "../platform/commands/messages";

// Web's half of the shared typing hook: the hub WebSocket for sending, plus
// the frame parsing — web receives raw WS frames where desktop gets typed
// Tauri events, so each app turns its own wire shape into the hook's calls.
export function useTypingIndicators(
  getSelectedChannelId: () => string | undefined,
  getSelectedConversationId: () => string | undefined,
  getMyPublicKey: () => string | null,
) {
  // App.tsx passes these as inline arrows, so a memo keyed on them would
  // rebuild every render and the hook's callbacks with it. Read through refs
  // instead: the getters are only ever called, never compared.
  const getChannel = useRef(getSelectedChannelId);
  getChannel.current = getSelectedChannelId;
  const getConversation = useRef(getSelectedConversationId);
  getConversation.current = getSelectedConversationId;

  const deps = useMemo(
    () => ({
      getChannelId: () => getChannel.current(),
      getConversationId: () => getConversation.current(),
      sendTyping: (channelId: string, typing: boolean) => {
        try {
          sendTypingEvent(channelId, typing);
        } catch {
          /* not connected */
        }
      },
      sendDmTyping: (conversationId: string, typing: boolean) => {
        try {
          sendDmTypingEvent(conversationId, typing);
        } catch {
          /* not connected */
        }
      },
    }),
    [],
  );

  const typing = useSharedTyping(deps);

  function receiveTyping(raw: Record<string, unknown>) {
    const type = raw.type as string;

    if (type === "typing") {
      const channelId = raw.channel_id as string | undefined;
      const pubkey = raw.public_key as string | undefined;
      if (!channelId || !pubkey) return;
      if (pubkey === getMyPublicKey()) return;
      const name = (raw.display_name as string | undefined) ?? pubkey.slice(0, 8);
      if (raw.typing === false) typing.clearTyping(channelId, pubkey);
      else typing.setTyping(channelId, pubkey, name);
      return;
    }

    if (type === "dm_typing") {
      const convId = raw.conversation_id as string | undefined;
      const sender = raw.sender as string | undefined;
      if (!convId || !sender) return;
      if (sender === getMyPublicKey()) return;
      const name = (raw.sender_name as string | undefined) ?? sender.slice(0, 8);
      if (raw.typing === false) typing.clearDmTyping(convId, sender);
      else typing.setDmTyping(convId, sender, name);
    }
  }

  return { ...typing, receiveTyping };
}
