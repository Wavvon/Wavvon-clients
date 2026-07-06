import { useState } from "react";
import type { SoundboardPlayedEvent } from "../types";

export interface SoundboardChip extends SoundboardPlayedEvent {
  id: string;
}

const CHIP_TTL_MS = 4000;

/** Validates a raw WS payload against the `soundboard_played` shape
 *  (soundboard.md §1 Routes and events) before it's trusted as attribution
 *  UX -- a malformed or unrelated event should silently no-op, not throw or
 *  render garbage. */
export function parseSoundboardPlayedEvent(raw: unknown): SoundboardPlayedEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const { channel_id, clip_id, clip_name, public_key } = m;
  if (
    typeof channel_id !== "string" || !channel_id ||
    typeof clip_id !== "string" || !clip_id ||
    typeof clip_name !== "string" || !clip_name ||
    typeof public_key !== "string" || !public_key
  ) {
    return null;
  }
  return { channel_id, clip_id, clip_name, public_key };
}

export function useSoundboardChips() {
  const [chipsByChannel, setChipsByChannel] = useState<Record<string, SoundboardChip[]>>({});

  function receiveSoundboardPlayed(raw: unknown) {
    const ev = parseSoundboardPlayedEvent(raw);
    if (!ev) return;
    const id = `${ev.channel_id}:${ev.clip_id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const chip: SoundboardChip = { ...ev, id };
    setChipsByChannel((prev) => ({
      ...prev,
      [ev.channel_id]: [...(prev[ev.channel_id] ?? []), chip],
    }));
    setTimeout(() => {
      setChipsByChannel((prev) => {
        const existing = prev[ev.channel_id];
        if (!existing) return prev;
        const next = existing.filter((c) => c.id !== id);
        if (next.length === 0) {
          const { [ev.channel_id]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [ev.channel_id]: next };
      });
    }, CHIP_TTL_MS);
  }

  return { chipsByChannel, receiveSoundboardPlayed };
}
