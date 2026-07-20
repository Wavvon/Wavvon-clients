// Pure logic for the voice-move primitive (events.md §7.1/§7.2) — kept
// separate from the WS handler and ChannelSidebar so the auto-accept vs.
// prompt branch and the mover's channel picker are unit-testable without a
// live socket or a DOM.

import type { Channel } from "@wavvon/core";
import { isSpawnerChannel } from "./spawnerChannels";

export interface VoiceMoveChannelOption {
  id: string;
  name: string;
}

/** Voice channels a mover can offer in the "Move to channel…" picker.
 *  Categories aren't rooms, banner channels have no voice component, and
 *  spawner channels only spawn a personal room on join — none are valid
 *  move destinations. */
export function moveChannelOptions(channels: Channel[]): VoiceMoveChannelOption[] {
  return channels
    .filter((c) => !c.is_category && c.channel_type !== "banner" && !isSpawnerChannel(c))
    .map((c) => ({ id: c.id, name: c.name }));
}

export interface VoiceMovePush {
  target_channel_id?: string;
  target_channel_name?: string;
  source_channel_id?: string | null;
  event_id?: string | null;
  auto?: boolean;
}

export type VoiceMoveDecision =
  | { kind: "ignore" }
  | { kind: "auto"; targetChannelId: string; targetChannelName: string; sourceChannelId: string | null }
  | { kind: "prompt"; targetChannelId: string; targetChannelName: string; sourceChannelId: string | null };

/** Decides what the client does with a `voice_move` push (events.md §7.2):
 *  `auto: true` (target claimed a slot / RSVP'd "going") runs the
 *  leave-and-join immediately with a rejoin-escape-hatch toast; otherwise a
 *  blocking accept/decline prompt. `target_channel_name` is always used
 *  as-is — the local channel list may not contain the destination (a
 *  voice-only-presence target has no read access to it), so callers must
 *  never look the name up locally. */
export function decideVoiceMove(m: VoiceMovePush): VoiceMoveDecision {
  if (!m.target_channel_id) return { kind: "ignore" };
  const targetChannelName = m.target_channel_name ?? "?";
  const sourceChannelId = m.source_channel_id ?? null;
  return m.auto
    ? { kind: "auto", targetChannelId: m.target_channel_id, targetChannelName, sourceChannelId }
    : { kind: "prompt", targetChannelId: m.target_channel_id, targetChannelName, sourceChannelId };
}
