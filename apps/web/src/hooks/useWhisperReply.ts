import { useMemo, useState } from "react";
import { pickReplyPubkey, useWhisperKeybinds } from "@wavvon/ui";
import type { WhisperReplyBind, WhisperTarget } from "@wavvon/ui";
import { loadWhisperReplyBind, saveWhisperReplyBind } from "../utils/whisperReply";
import type { User } from "@shared/types";
import type { useWhisper } from "./useWhisper";

/** The persisted reply-key binding, the reply target derived from the inbound
 *  whisper log, and the whisper keybinds that use both. */
export function useWhisperReply(
  whisper: ReturnType<typeof useWhisper>,
  voiceChannelId: string | null,
  users: User[],
) {
  const [whisperReplyBind, setWhisperReplyBindState] = useState<WhisperReplyBind>(loadWhisperReplyBind);
  const setWhisperReplyBind = (bind: WhisperReplyBind) => {
    setWhisperReplyBindState(bind);
    saveWhisperReplyBind(bind);
  };
  // Reply key target: the most recent inbound whisperer (see pickReplyPubkey).
  const whisperReplyTarget = useMemo<WhisperTarget | null>(() => {
    const pk = pickReplyPubkey(whisper.inboundWhisperLog);
    if (!pk) return null;
    const name = users.find((u) => u.public_key === pk)?.display_name;
    return { type: "user", id: pk, label: name || pk.slice(0, 8) };
  }, [whisper.inboundWhisperLog, users]);
  useWhisperKeybinds({
    voiceChannelId,
    whisperLists: whisper.whisperLists,
    isWhispering: whisper.isWhispering,
    startWhisper: whisper.startWhisper,
    stopWhisper: whisper.stopWhisper,
    replyBind: whisperReplyBind,
    replyTarget: whisperReplyTarget,
  });

  return { whisperReplyBind, setWhisperReplyBind };
}
