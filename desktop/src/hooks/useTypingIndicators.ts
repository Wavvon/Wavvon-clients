import { useState, useEffect, useRef, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Channel, Conversation } from "../types";

export interface TypingIndicators {
  typingByKey: Record<string, { name: string; ts: number }>;
  dmTypingByKey: Record<string, { name: string; ts: number }>;
  pingTyping: () => void;
  pingDmTyping: () => void;
  setTypingEntry: (pubkey: string, name: string) => void;
  clearTypingEntry: (pubkey: string) => void;
  setDmTypingEntry: (pubkey: string, name: string) => void;
  clearDmTypingEntry: (pubkey: string) => void;
  clearAllTyping: () => void;
  clearAllDmTyping: () => void;
}

export function useTypingIndicators(
  selectedChannelRef: RefObject<Channel | null>,
  selectedConversationRef: RefObject<Conversation | null>,
): TypingIndicators {
  const [typingByKey, setTypingByKey] = useState<
    Record<string, { name: string; ts: number }>
  >({});
  const [dmTypingByKey, setDmTypingByKey] = useState<
    Record<string, { name: string; ts: number }>
  >({});

  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const dmTypingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDmTypingSentRef = useRef<number>(0);

  useEffect(() => {
    const handle = setInterval(() => {
      const cutoff = Date.now() - 5000;
      function trim<T extends { ts: number }>(prev: Record<string, T>) {
        let changed = false;
        const next: Record<string, T> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.ts >= cutoff) next[k] = v;
          else changed = true;
        }
        return changed ? next : prev;
      }
      setTypingByKey(trim);
      setDmTypingByKey(trim);
    }, 1000);
    return () => clearInterval(handle);
  }, []);

  function pingTyping() {
    const ch = selectedChannelRef.current;
    if (!ch) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 3000) {
      lastTypingSentRef.current = now;
      invoke("set_typing", { channelId: ch.id, typing: true }).catch(() => {});
    }
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(() => {
      const current = selectedChannelRef.current;
      if (current) {
        invoke("set_typing", { channelId: current.id, typing: false }).catch(() => {});
      }
      lastTypingSentRef.current = 0;
    }, 4000);
  }

  function pingDmTyping() {
    const conv = selectedConversationRef.current;
    if (!conv) return;
    const convId = conv.id;
    const now = Date.now();
    if (now - lastDmTypingSentRef.current > 3000) {
      lastDmTypingSentRef.current = now;
      invoke("set_dm_typing", { conversationId: convId, typing: true }).catch(() => {});
    }
    if (dmTypingDebounceRef.current) clearTimeout(dmTypingDebounceRef.current);
    dmTypingDebounceRef.current = setTimeout(() => {
      invoke("set_dm_typing", { conversationId: convId, typing: false }).catch(() => {});
      lastDmTypingSentRef.current = 0;
    }, 4000);
  }

  function setTypingEntry(pubkey: string, name: string) {
    setTypingByKey((prev) => ({ ...prev, [pubkey]: { name, ts: Date.now() } }));
  }

  function clearTypingEntry(pubkey: string) {
    setTypingByKey((prev) => {
      if (!prev[pubkey]) return prev;
      const { [pubkey]: _, ...rest } = prev;
      return rest;
    });
  }

  function setDmTypingEntry(pubkey: string, name: string) {
    setDmTypingByKey((prev) => ({ ...prev, [pubkey]: { name, ts: Date.now() } }));
  }

  function clearDmTypingEntry(pubkey: string) {
    setDmTypingByKey((prev) => {
      if (!prev[pubkey]) return prev;
      const { [pubkey]: _, ...rest } = prev;
      return rest;
    });
  }

  function clearAllTyping() {
    setTypingByKey({});
  }

  function clearAllDmTyping() {
    setDmTypingByKey({});
  }

  return {
    typingByKey,
    dmTypingByKey,
    pingTyping,
    pingDmTyping,
    setTypingEntry,
    clearTypingEntry,
    setDmTypingEntry,
    clearDmTypingEntry,
    clearAllTyping,
    clearAllDmTyping,
  };
}
