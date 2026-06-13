import { useState, useRef, useCallback } from "react";
import { sendTypingEvent, sendDmTypingEvent } from "../platform/commands/messages";

interface TypingEntry { name: string; ts: number }

export function useTypingIndicators(
  getSelectedChannelId: () => string | undefined,
  getSelectedConversationId: () => string | undefined,
  getMyPublicKey: () => string | null,
) {
  const [typingByKey, setTypingByKey] = useState<Record<string, TypingEntry>>({});
  const [dmTypingByKey, setDmTypingByKey] = useState<Record<string, TypingEntry>>({});

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dmTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dmTypingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const lastDmTypingSentRef = useRef<number>(0);

  function receiveTyping(raw: Record<string, unknown>) {
    const type = raw.type as string;
    const now = Date.now();

    if (type === "typing") {
      const channelId = raw.channel_id as string | undefined;
      const pubkey = raw.public_key as string | undefined;
      if (!channelId || !pubkey) return;
      if (pubkey === getMyPublicKey()) return;
      const displayName = raw.display_name as string | undefined;
      const name = displayName ?? pubkey.slice(0, 8);
      const key = `${channelId}:${pubkey}`;
      const isTyping = raw.typing as boolean | undefined;
      if (isTyping === false) {
        setTypingByKey((prev) => { const { [key]: _, ...rest } = prev; return rest; });
      } else {
        setTypingByKey((prev) => ({ ...prev, [key]: { name, ts: now } }));
        setTimeout(() => {
          setTypingByKey((prev) => {
            const entry = prev[key];
            if (!entry || entry.ts !== now) return prev;
            const { [key]: _, ...rest } = prev;
            return rest;
          });
        }, 6000);
      }
    } else if (type === "dm_typing") {
      const convId = raw.conversation_id as string | undefined;
      const sender = raw.sender as string | undefined;
      if (!convId || !sender) return;
      if (sender === getMyPublicKey()) return;
      const senderName = raw.sender_name as string | undefined;
      const name = senderName ?? sender.slice(0, 8);
      const key = `${convId}:${sender}`;
      const isTyping = raw.typing as boolean | undefined;
      if (isTyping === false) {
        setDmTypingByKey((prev) => { const { [key]: _, ...rest } = prev; return rest; });
      } else {
        setDmTypingByKey((prev) => ({ ...prev, [key]: { name, ts: now } }));
        setTimeout(() => {
          setDmTypingByKey((prev) => {
            const entry = prev[key];
            if (!entry || entry.ts !== now) return prev;
            const { [key]: _, ...rest } = prev;
            return rest;
          });
        }, 6000);
      }
    }
  }

  const pingTyping = useCallback(() => {
    const chId = getSelectedChannelId();
    if (!chId) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 3000) {
      lastTypingSentRef.current = now;
      try { sendTypingEvent(chId, true); } catch {}
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => { typingTimerRef.current = null; }, 3000);
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      const cId = getSelectedChannelId();
      if (cId) { try { sendTypingEvent(cId, false); } catch {} }
      typingStopTimerRef.current = null;
      typingTimerRef.current = null;
      lastTypingSentRef.current = 0;
    }, 4000);
  }, [getSelectedChannelId]);

  const pingDmTyping = useCallback(() => {
    const convId = getSelectedConversationId();
    if (!convId) return;
    const now = Date.now();
    if (now - lastDmTypingSentRef.current > 3000) {
      lastDmTypingSentRef.current = now;
      try { sendDmTypingEvent(convId, true); } catch {}
    }
    if (dmTypingTimerRef.current) clearTimeout(dmTypingTimerRef.current);
    dmTypingTimerRef.current = setTimeout(() => { dmTypingTimerRef.current = null; }, 3000);
    if (dmTypingStopTimerRef.current) clearTimeout(dmTypingStopTimerRef.current);
    dmTypingStopTimerRef.current = setTimeout(() => {
      const cId = getSelectedConversationId();
      if (cId) { try { sendDmTypingEvent(cId, false); } catch {} }
      dmTypingStopTimerRef.current = null;
      dmTypingTimerRef.current = null;
      lastDmTypingSentRef.current = 0;
    }, 4000);
  }, [getSelectedConversationId]);

  return {
    typingByKey,
    dmTypingByKey,
    receiveTyping,
    pingTyping,
    pingDmTyping,
  };
}
