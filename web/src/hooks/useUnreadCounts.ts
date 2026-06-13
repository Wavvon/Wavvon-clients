import { useState, useCallback } from "react";

export function useUnreadCounts() {
  const [unreadByChannel, setUnreadByChannel] = useState<Record<string, Record<string, boolean>>>({});
  const [unreadDms, setUnreadDms] = useState<Record<string, boolean>>({});

  const bumpUnread = useCallback((hubId: string, channelId: string) => {
    setUnreadByChannel((prev) => ({
      ...prev,
      [hubId]: { ...(prev[hubId] ?? {}), [channelId]: true },
    }));
  }, []);

  const clearUnread = useCallback((hubId: string, channelId: string) => {
    setUnreadByChannel((prev) => {
      const m = prev[hubId];
      if (!m?.[channelId]) return prev;
      const { [channelId]: _, ...rest } = m;
      return { ...prev, [hubId]: rest };
    });
  }, []);

  const clearHubUnread = useCallback((hubId: string) => {
    setUnreadByChannel((prev) => ({ ...prev, [hubId]: {} }));
  }, []);

  const seedUnreadFromServer = useCallback((hubId: string, counts: { channel_id: string; unread_count: number }[]) => {
    const map: Record<string, boolean> = {};
    for (const c of counts) {
      if (c.unread_count > 0) map[c.channel_id] = true;
    }
    setUnreadByChannel((prev) => ({ ...prev, [hubId]: map }));
  }, []);

  return {
    unreadByChannel,
    unreadDms,
    setUnreadDms,
    bumpUnread,
    clearUnread,
    clearHubUnread,
    seedUnreadFromServer,
  };
}
