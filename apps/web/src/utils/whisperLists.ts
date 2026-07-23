import { getScoped, setScoped } from "./accountScope";
import type { WhisperList } from "@wavvon/ui";

const WHISPER_LISTS_KEY = "wavvon.whisperLists";

// Saved whisper target lists, scoped per hub (desktop stores these per-hub
// too, via load_whisper_lists/save_whisper_lists) inside one per-account
// localStorage key: { [hubId]: WhisperList[] }.
function load(): Record<string, WhisperList[]> {
  try { return JSON.parse(getScoped(WHISPER_LISTS_KEY) ?? "{}"); } catch { return {}; }
}

export function loadWhisperLists(hubId: string): WhisperList[] {
  return load()[hubId] ?? [];
}

export function saveWhisperLists(hubId: string, lists: WhisperList[]): void {
  const all = load();
  all[hubId] = lists;
  setScoped(WHISPER_LISTS_KEY, JSON.stringify(all));
}
