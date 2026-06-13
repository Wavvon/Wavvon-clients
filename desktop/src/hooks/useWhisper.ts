import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface WhisperTarget { type: "user" | "channel" | "role"; id: string; label: string; }
export interface WhisperList { id: string; name: string; targets: WhisperTarget[]; keybind?: string; }

interface UseWhisperParams {
  activeHubId: string | null;
  voiceChannelId: string | null;
}

export function useWhisper({ activeHubId, voiceChannelId }: UseWhisperParams) {
  const [isWhispering, setIsWhispering] = useState(false);
  const [whisperTargets, setWhisperTargets] = useState<WhisperTarget[]>([]);
  const [whisperLists, setWhisperLists] = useState<WhisperList[]>([]);
  const [inboundWhispers, setInboundWhispers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!activeHubId) { setWhisperLists([]); return; }
    invoke<WhisperList[]>("load_whisper_lists", { hubId: activeHubId })
      .then(setWhisperLists).catch(() => setWhisperLists([]));
  }, [activeHubId]);

  useEffect(() => {
    if (!activeHubId) return;
    const unsubs: Array<() => void> = [];
    listen<{ hub_id: string; sender_pubkey: string; is_whisper: boolean }>(
      "voice-whisper-receiving", (e) => {
        if (e.payload.hub_id !== activeHubId) return;
        setInboundWhispers(prev => {
          const next = new Set(prev);
          if (e.payload.is_whisper) next.add(e.payload.sender_pubkey);
          else next.delete(e.payload.sender_pubkey);
          return next;
        });
      }
    ).then(u => unsubs.push(u));
    return () => unsubs.forEach(u => u());
  }, [activeHubId]);

  useEffect(() => {
    if (!voiceChannelId) setInboundWhispers(new Set());
  }, [voiceChannelId]);

  async function startWhisper(targets: WhisperTarget[]) {
    if (!voiceChannelId || targets.length === 0) return;
    setWhisperTargets(targets);
    setIsWhispering(true);
    await invoke("start_whisper", {
      targets: targets.map(t => ({ type: t.type, id: t.id }))
    }).catch(console.error);
  }

  async function stopWhisper() {
    setIsWhispering(false);
    setWhisperTargets([]);
    await invoke("stop_whisper").catch(console.error);
  }

  async function toggleWhisper(targets: WhisperTarget[]) {
    if (isWhispering) await stopWhisper();
    else await startWhisper(targets);
  }

  async function saveWhisperList(list: WhisperList) {
    if (!activeHubId) return;
    const updated = whisperLists.some(l => l.id === list.id)
      ? whisperLists.map(l => l.id === list.id ? list : l)
      : [...whisperLists, list];
    setWhisperLists(updated);
    await invoke("save_whisper_lists", { hubId: activeHubId, lists: updated }).catch(console.error);
  }

  async function deleteWhisperList(id: string) {
    if (!activeHubId) return;
    const updated = whisperLists.filter(l => l.id !== id);
    setWhisperLists(updated);
    await invoke("save_whisper_lists", { hubId: activeHubId, lists: updated }).catch(console.error);
  }

  return {
    isWhispering, whisperTargets, whisperLists, inboundWhispers,
    startWhisper, stopWhisper, toggleWhisper, saveWhisperList, deleteWhisperList,
  };
}
