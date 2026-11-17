import { useCallback, useState } from "react";
import { useSavedMessages, type SavedMessage } from "@wavvon/ui";
import { getScoped, setScoped } from "../utils/accountScope";

// Synced through the prefs blob (syncedSettings.ts): personal axis.
export const SAVED_MESSAGES_KEY = "wavvon.savedMessages";

export function useSavedList(onDue?: (due: SavedMessage[]) => void) {
  const [raw, setRawState] = useState<string | null>(() => getScoped(SAVED_MESSAGES_KEY));
  const setRaw = useCallback((next: string) => {
    setScoped(SAVED_MESSAGES_KEY, next);
    setRawState(next);
  }, []);
  return useSavedMessages(raw, setRaw, onDue);
}
