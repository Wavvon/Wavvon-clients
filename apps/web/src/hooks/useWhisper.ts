import { useMemo } from "react";
import { activeSession, allSessions } from "@platform";
import { useWhisper as useSharedWhisper } from "@wavvon/ui";
import type { WhisperTarget } from "@wavvon/ui";
import { loadWhisperLists, saveWhisperLists } from "../utils/whisperLists";
import { loadWhisperOptout, saveWhisperOptout } from "../utils/whisperOptout";

interface UseWhisperParams {
  activeHubId: string | null;
  voiceChannelId: string | null;
}

// Web's platform half of the shared whisper hook: localStorage for the named
// lists and the opt-out, and the existing hub WebSocket for transport.
//
// The opt-out goes to *every* connected session, not just the active hub. The
// hub holds it per connection, and a user who opted out meant it everywhere.
export function useWhisper({ activeHubId, voiceChannelId }: UseWhisperParams) {
  const deps = useMemo(
    () => ({
      loadLists: (hubId: string) => loadWhisperLists(hubId),
      saveLists: (hubId: string, lists: Parameters<typeof saveWhisperLists>[1]) =>
        saveWhisperLists(hubId, lists),
      loadOptout: loadWhisperOptout,
      saveOptout: saveWhisperOptout,
      sendStart: (targets: WhisperTarget[]) => {
        try {
          activeSession().ws?.startWhisper(targets.map((t) => ({ type: t.type, id: t.id })));
        } catch {
          /* not connected */
        }
      },
      sendStop: () => {
        try {
          activeSession().ws?.stopWhisper();
        } catch {
          /* not connected */
        }
      },
      sendOptout: (enabled: boolean) => {
        for (const s of allSessions()) {
          try {
            s.ws?.setWhisperOptout(enabled);
          } catch {
            /* not connected */
          }
        }
      },
    }),
    [],
  );

  return useSharedWhisper({ activeHubId, voiceChannelId, ...deps });
}
