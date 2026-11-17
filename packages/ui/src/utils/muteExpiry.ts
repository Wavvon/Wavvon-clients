/** Epoch-ms deadlines of timed mutes, stored next to the notify modes. A
 *  timed mute is the `silent` mode plus one of these; like presence's
 *  `until` it is a point in time, so a reload or another device keeps it. */
export interface MuteDeadlines {
  hubs: Record<string, number>;
  channels: Record<string, Record<string, number>>;
}

export const MUTE_FOR = ["15m", "1h", "8h", "tomorrow"] as const;
export type MuteFor = (typeof MUTE_FOR)[number];

/** When a mute picked now ends. "Tomorrow" is 08:00 local time the next day. */
export function muteDeadline(choice: MuteFor, now: Date = new Date()): number {
  const t = now.getTime();
  switch (choice) {
    case "15m": return t + 15 * 60_000;
    case "1h": return t + 60 * 60_000;
    case "8h": return t + 8 * 60 * 60_000;
    case "tomorrow": {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(8, 0, 0, 0);
      return d.getTime();
    }
  }
}

export interface ExpiredMutes {
  hubs: string[];
  channels: Array<[hubId: string, channelId: string]>;
}

/** The deadlines that have passed, and the earliest one still ahead. */
export function expiredMutes(
  d: MuteDeadlines,
  now: number = Date.now(),
): { expired: ExpiredMutes; next: number | null } {
  const expired: ExpiredMutes = { hubs: [], channels: [] };
  let next: number | null = null;
  const see = (until: number, onExpired: () => void) => {
    if (until <= now) onExpired();
    else if (next === null || until < next) next = until;
  };
  for (const [hubId, until] of Object.entries(d.hubs)) see(until, () => expired.hubs.push(hubId));
  for (const [hubId, inner] of Object.entries(d.channels)) {
    for (const [chId, until] of Object.entries(inner)) see(until, () => expired.channels.push([hubId, chId]));
  }
  return { expired, next };
}

/** Drop the deadlines listed in `expired` (or every deadline of one hub or channel). */
export function withoutDeadlines(d: MuteDeadlines, expired: ExpiredMutes): MuteDeadlines {
  const hubs = { ...d.hubs };
  for (const h of expired.hubs) delete hubs[h];
  const channels = { ...d.channels };
  for (const [h, c] of expired.channels) {
    const inner = { ...(channels[h] ?? {}) };
    delete inner[c];
    if (Object.keys(inner).length) channels[h] = inner;
    else delete channels[h];
  }
  return { hubs, channels };
}
