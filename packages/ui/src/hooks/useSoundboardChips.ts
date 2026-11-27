import { useRef, useState } from "react";
import type { SoundboardChip } from "../types";

/** The `soundboard_played` WS payload (soundboard.md §1 Routes and events). */
export interface SoundboardPlayedEvent {
  channel_id: string;
  clip_id: string;
  clip_name: string;
  /** Absent on hubs older than the burst; null when the clip has no emoji. */
  emoji?: string | null;
  public_key: string;
}

const CHIP_TTL_MS = 4000;

/** Validates a raw WS payload against the `soundboard_played` shape before
 *  it's trusted as attribution UX -- a malformed or unrelated event should
 *  silently no-op, not throw or render garbage. */
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
  const emoji = typeof m.emoji === "string" && m.emoji ? m.emoji : null;
  return { channel_id, clip_id, clip_name, emoji, public_key };
}

/** Per-channel transient "🔊 X played *name*" chips, self-expiring after
 *  `CHIP_TTL_MS`. Network-free — both apps feed it raw WS payloads from
 *  whatever transport they use (web: the hub WebSocket; desktop: the
 *  `soundboard-played` Tauri event). Deafened, you hear no clip, so a play
 *  makes no chip and no burst either; nor does one by somebody you
 *  blocked, whose clip you do not hear. */
export function useSoundboardChips(deafened = false, silenced?: ReadonlySet<string>) {
  const [chipsByChannel, setChipsByChannel] = useState<Record<string, SoundboardChip[]>>({});
  const deafenedRef = useRef(deafened);
  deafenedRef.current = deafened;
  const silencedRef = useRef(silenced);
  silencedRef.current = silenced;

  function receiveSoundboardPlayed(raw: unknown) {
    if (deafenedRef.current) return;
    const ev = parseSoundboardPlayedEvent(raw);
    if (!ev || silencedRef.current?.has(ev.public_key)) return;
    const id = `${ev.channel_id}:${ev.clip_id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const chip: SoundboardChip = { id, public_key: ev.public_key, clip_name: ev.clip_name, emoji: ev.emoji };
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
