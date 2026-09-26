import { useCallback, useEffect, useState } from "react";
import { applyWhisperLogEvent } from "../utils/whisperInbox";
import type { InboundWhisperEntry } from "../utils/whisperInbox";
import type { WhisperTarget, WhisperList } from "../types";

export interface WhisperDeps {
  /** Named target lists for one hub. Web reads localStorage synchronously,
   *  desktop reads the account directory, so both shapes are allowed. */
  loadLists: (hubId: string) => WhisperList[] | Promise<WhisperList[]>;
  saveLists: (hubId: string, lists: WhisperList[]) => void | Promise<void>;
  /** The receive opt-out, as the app stores it. `refreshOptout` exists for a
   *  client whose real answer arrives late (desktop reads it off disk), where
   *  the synchronous `loadOptout` is only a first guess. */
  loadOptout: () => boolean;
  saveOptout: (enabled: boolean) => void | Promise<void>;
  refreshOptout?: () => Promise<boolean>;
  /** Transport. Web rides the existing hub WebSocket, desktop invokes the
   *  Tauri shell — and `sendOptout` differs by more than the call: web tells
   *  every connected session, desktop only the active hub. */
  sendStart: (targets: WhisperTarget[]) => void | Promise<void>;
  sendStop: () => void | Promise<void>;
  sendOptout: (enabled: boolean) => void | Promise<void>;
  /** Inbound whisper pushes, for a client that receives them out of band.
   *  Web has none: its WS handler registry calls `receiveWhisperEvent`
   *  directly. Returns its own teardown. */
  subscribeInbound?: (
    hubId: string,
    onEvent: (senderPubkey: string, isWhisper: boolean) => void,
  ) => (() => void) | Promise<() => void>;
}

export interface WhisperParams extends WhisperDeps {
  activeHubId: string | null;
  voiceChannelId: string | null;
}

// Whisper state: who we are whispering to, who is whispering at us, the named
// target lists, and the hub-enforced receive opt-out. Converged from the two
// app copies — the state machine was already identical, only persistence and
// transport differed, and both of those now travel in through deps.
export function useWhisper({
  activeHubId,
  voiceChannelId,
  loadLists,
  saveLists,
  loadOptout,
  saveOptout,
  refreshOptout,
  sendStart,
  sendStop,
  sendOptout,
  subscribeInbound,
}: WhisperParams) {
  const [isWhispering, setIsWhispering] = useState(false);
  const [whisperTargets, setWhisperTargets] = useState<WhisperTarget[]>([]);
  const [whisperLists, setWhisperLists] = useState<WhisperList[]>([]);
  const [inboundWhispers, setInboundWhispers] = useState<Set<string>>(new Set());
  const [inboundWhisperLog, setInboundWhisperLog] = useState<InboundWhisperEntry[]>([]);
  const [whisperOptout, setWhisperOptoutState] = useState<boolean>(loadOptout);

  useEffect(() => {
    if (!refreshOptout) return;
    let cancelled = false;
    void refreshOptout().then((v) => {
      if (!cancelled) setWhisperOptoutState(v);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshOptout]);

  useEffect(() => {
    if (!activeHubId) {
      setWhisperLists([]);
      return;
    }
    let cancelled = false;
    void Promise.resolve(loadLists(activeHubId))
      .then((lists) => {
        if (!cancelled) setWhisperLists(lists);
      })
      .catch(() => {
        if (!cancelled) setWhisperLists([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeHubId, loadLists]);

  const receiveWhisperEvent = useCallback((senderPubkey: string, isWhisper: boolean) => {
    setInboundWhispers((prev) => {
      const next = new Set(prev);
      if (isWhisper) next.add(senderPubkey);
      else next.delete(senderPubkey);
      return next;
    });
    setInboundWhisperLog((prev) => applyWhisperLogEvent(prev, senderPubkey, isWhisper));
  }, []);

  useEffect(() => {
    if (!subscribeInbound || !activeHubId) return;
    let teardown: (() => void) | undefined;
    let cancelled = false;
    void Promise.resolve(subscribeInbound(activeHubId, receiveWhisperEvent)).then((off) => {
      if (cancelled) off();
      else teardown = off;
    });
    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [subscribeInbound, activeHubId, receiveWhisperEvent]);

  // Leaving voice ends everything whisper-related. Desktop cleared only the
  // inbound half and kept `isWhispering` true after leaving the channel it was
  // whispering in, which lit the button with nothing behind it.
  useEffect(() => {
    if (!voiceChannelId) {
      setInboundWhispers(new Set());
      setInboundWhisperLog([]);
      setIsWhispering(false);
      setWhisperTargets([]);
    }
  }, [voiceChannelId]);

  function dismissInbound(pubkey: string, startedAt: number) {
    setInboundWhisperLog((prev) =>
      prev.filter((e) => !(e.pubkey === pubkey && e.startedAt === startedAt)),
    );
  }

  function clearInbound() {
    setInboundWhisperLog([]);
  }

  /** Hub-enforced receive opt-out. The hub holds this per *connection*, so it
   *  is re-sent on every (re)connect by each app's WS status handler. */
  function setWhisperOptout(enabled: boolean) {
    setWhisperOptoutState(enabled);
    void saveOptout(enabled);
    void sendOptout(enabled);
    if (enabled) {
      // The hub drops us from live target sets but doesn't push a
      // voice_whisper_stopped on re-resolution, so end live state locally.
      setInboundWhispers(new Set());
      setInboundWhisperLog((prev) => prev.map((e) => (e.live ? { ...e, live: false } : e)));
    }
  }

  function startWhisper(targets: WhisperTarget[]) {
    if (!voiceChannelId || targets.length === 0) return;
    setWhisperTargets(targets);
    setIsWhispering(true);
    void sendStart(targets);
  }

  function stopWhisper() {
    setIsWhispering(false);
    setWhisperTargets([]);
    void sendStop();
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
    void saveLists(activeHubId, updated);
  }

  function deleteWhisperList(id: string) {
    if (!activeHubId) return;
    const updated = whisperLists.filter((l) => l.id !== id);
    setWhisperLists(updated);
    void saveLists(activeHubId, updated);
  }

  return {
    isWhispering,
    whisperTargets,
    whisperLists,
    inboundWhispers,
    inboundWhisperLog,
    whisperOptout,
    startWhisper,
    stopWhisper,
    toggleWhisper,
    saveWhisperList,
    deleteWhisperList,
    receiveWhisperEvent,
    dismissInbound,
    clearInbound,
    setWhisperOptout,
  };
}
