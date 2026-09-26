export type UnreadMap = Record<string, Record<string, boolean>>;

// The map transitions behind useUnreadCounts, pulled out so they can be tested
// without a renderer (packages/ui has no jsdom, by convention).
//
// Every one of these returns `prev` unchanged when nothing actually changes,
// and that identity is load-bearing twice over: React skips the re-render, and
// the desktop persistence effect — which fires on a new object — skips a write
// to disk. A version that always built a fresh object would still be correct
// on screen and would quietly save on every incoming message.

export function bumpChannelUnread(prev: UnreadMap, hubId: string, channelId: string): UnreadMap {
  const hubMap = prev[hubId] ?? {};
  if (hubMap[channelId]) return prev;
  return { ...prev, [hubId]: { ...hubMap, [channelId]: true } };
}

export function clearChannelUnread(prev: UnreadMap, hubId: string, channelId: string): UnreadMap {
  const hubMap = prev[hubId];
  if (!hubMap?.[channelId]) return prev;
  const { [channelId]: _removed, ...rest } = hubMap;
  return { ...prev, [hubId]: rest };
}

export function clearHubChannelUnread(prev: UnreadMap, hubId: string): UnreadMap {
  const hubMap = prev[hubId];
  if (!hubMap || Object.keys(hubMap).length === 0) return prev;
  return { ...prev, [hubId]: {} };
}

/// Replace one hub's unread set from the server's per-channel counts. A count
/// of zero is a read channel, not an absent one, so it must not become a key.
export function seedHubUnread(
  prev: UnreadMap,
  hubId: string,
  counts: { channel_id: string; unread_count: number }[],
): UnreadMap {
  const map: Record<string, boolean> = {};
  for (const c of counts) {
    if (c.unread_count > 0) map[c.channel_id] = true;
  }
  return { ...prev, [hubId]: map };
}

export function unreadCountsByHub(map: UnreadMap): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [hub, m] of Object.entries(map)) {
    out[hub] = Object.keys(m).length;
  }
  return out;
}

export function totalUnread(byHub: Record<string, number>): number {
  return Object.values(byHub).reduce((n, v) => n + v, 0);
}

export function unreadDocumentTitle(total: number): string {
  return total > 0 ? `(${total > 99 ? "99+" : total}) Wavvon` : "Wavvon";
}
