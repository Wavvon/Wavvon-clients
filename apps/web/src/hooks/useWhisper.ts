import { useEffect, useState } from "react";
import { activeSession } from "@platform";
import type { WhisperTarget, WhisperList } from "@wavvon/ui";
import { loadWhisperLists, saveWhisperLists } from "../utils/whisperLists";

interface UseWhisperParams {
  activeHubId: string | null;
  voiceChannelId: string | null;
}

// Web mirror of the desktop useWhisper hook (apps/desktop/src/hooks/useWhisper.ts):
// same state shape and named-list persistence, but whisper start/stop rides the
// existing WS session (platform/ws.ts) instead of a Tauri invoke/event pair.
export function useWhisper({ activeHubId, voiceChannelId }: UseWhisperParams) {
  const [isWhispering, setIsWhispering] = useState(false);
  const [whisperTargets, setWhisperTargets] = useState<WhisperTarget[]>([]);
  const [whisperLists, setWhisperLists] = useState<WhisperList[]>([]);
  const [inboundWhispers, setInboundWhispers] = useState<Set<string>>(new Set());

  useEffect(() => {
    setWhisperLists(activeHubId ? loadWhisperLists(activeHubId) : []);
  }, [activeHubId]);

  useEffect(() => {
    if (!voiceChannelId) {
      setInboundWhispers(new Set());
      setIsWhispering(false);
      setWhisperTargets([]);
    }
  }, [voiceChannelId]);

  function receiveWhisperEvent(senderPubkey: string, isWhisper: boolean) {
    setInboundWhispers((prev) => {
      const next = new Set(prev);
      if (isWhisper) next.add(senderPubkey);
      else next.delete(senderPubkey);
      return next;
    });
  }

  function startWhisper(targets: WhisperTarget[]) {
    if (!voiceChannelId || targets.length === 0) return;
    setWhisperTargets(targets);
    setIsWhispering(true);
    try { activeSession().ws?.startWhisper(targets.map((t) => ({ type: t.type, id: t.id }))); } catch { /* not connected */ }
  }

  function stopWhisper() {
    setIsWhispering(false);
    setWhisperTargets([]);
    try { activeSession().ws?.stopWhisper(); } catch { /* not connected */ }
  }

  function toggleWhisper(targets: WhisperTarget[]) {
    if (isWhispering) stopWhisper();
    else startWhisper(targets);
  }

  function saveWhisperList(list: WhisperList) {
    if (!activeHubId) return;
    const updated = whisperLists.some((l) => l.id === list.id)
      ? whisperLists.map((l) => (l.id === list.id ? list : l))
      : [...whisperLists, list];
    setWhisperLists(updated);
    saveWhisperLists(activeHubId, updated);
  }

  function deleteWhisperList(id: string) {
    if (!activeHubId) return;
    const updated = whisperLists.filter((l) => l.id !== id);
    setWhisperLists(updated);
    saveWhisperLists(activeHubId, updated);
  }

  return {
    isWhispering, whisperTargets, whisperLists, inboundWhispers,
    startWhisper, stopWhisper, toggleWhisper, saveWhisperList, deleteWhisperList,
    receiveWhisperEvent,
  };
}
