import { useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useWhisper as useSharedWhisper } from "@wavvon/ui";
import type { WhisperTarget, WhisperList } from "@wavvon/ui";
import { loadWhisperOptout, saveWhisperOptout, refreshWhisperOptout } from "../utils/whisperOptout";

export type { WhisperTarget, WhisperList };

interface UseWhisperParams {
  activeHubId: string | null;
  voiceChannelId: string | null;
}

// Desktop's platform half of the shared whisper hook: the Tauri shell for
// lists, transport and the opt-out, plus a Tauri event for inbound pushes —
// web gets those through its WS handler registry instead, which is why
// subscribeInbound is optional in the shared hook.
export function useWhisper({ activeHubId, voiceChannelId }: UseWhisperParams) {
  // Read through a ref so the deps object stays stable — rebuilding it on a
  // hub switch would re-run the list load and re-subscribe for no reason.
  const activeHubIdRef = useRef(activeHubId);
  activeHubIdRef.current = activeHubId;

  const deps = useMemo(
    () => ({
      loadLists: (hubId: string) => invoke<WhisperList[]>("load_whisper_lists", { hubId }),
      saveLists: (hubId: string, lists: WhisperList[]) => {
        invoke("save_whisper_lists", { hubId, lists }).catch(console.error);
      },
      loadOptout: loadWhisperOptout,
      saveOptout: saveWhisperOptout,
      refreshOptout: refreshWhisperOptout,
      sendStart: (targets: WhisperTarget[]) => {
        invoke("start_whisper", {
          targets: targets.map((t) => ({ type: t.type, id: t.id })),
        }).catch(console.error);
      },
      sendStop: () => {
        invoke("stop_whisper").catch(console.error);
      },
      // Per connection on the hub, and desktop authenticates per hub, so the
      // active one is the only session this can reach.
      sendOptout: (enabled: boolean) => {
        if (!activeHubIdRef.current) return;
        invoke("send_hub_ws_raw_to", {
          hubId: activeHubIdRef.current,
          payload: JSON.stringify({ type: "voice_whisper_optout", enabled }),
        }).catch(() => {
          /* session raced away */
        });
      },
      subscribeInbound: (
        hubId: string,
        onEvent: (senderPubkey: string, isWhisper: boolean) => void,
      ) =>
        listen<{ hub_id: string; sender_pubkey: string; is_whisper: boolean }>(
          "voice-whisper-receiving",
          (e) => {
            if (e.payload.hub_id !== hubId) return;
            onEvent(e.payload.sender_pubkey, e.payload.is_whisper);
          },
        ),
    }),
    [],
  );

  return useSharedWhisper({ activeHubId, voiceChannelId, ...deps });
}
