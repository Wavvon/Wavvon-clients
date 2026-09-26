import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  bumpChannelUnread,
  clearChannelUnread,
  clearHubChannelUnread,
  seedHubUnread,
  totalUnread,
  unreadCountsByHub,
  unreadDocumentTitle,
} from "../utils/unreadCounts";

export interface UnreadCountsDeps {
  // Read the persisted per-hub/per-channel map once at mount. Absent on a
  // client that keeps unread state in memory only.
  loadPersisted?: () => Promise<Record<string, Record<string, boolean>> | null>;
  // Write it back whenever it changes. Never called for the value that came
  // out of loadPersisted — restoring is not a change.
  persist?: (state: Record<string, Record<string, boolean>>) => void;
  // The unread total, whenever it changes. For chrome outside the page: the
  // desktop tray badge. The document title is handled here, since both
  // clients set the identical string.
  onTotalChange?: (total: number) => void;
}

export interface UnreadCounts {
  unreadByChannel: Record<string, Record<string, boolean>>;
  unreadByHub: Record<string, number>;
  unreadDms: Record<string, boolean>;
  setUnreadDms: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  bumpUnread: (hubId: string, channelId: string) => void;
  clearUnread: (hubId: string, channelId: string) => void;
  clearHubUnread: (hubId: string) => void;
  seedUnreadFromServer: (
    hubId: string,
    counts: { channel_id: string; unread_count: number }[],
  ) => void;
}

// Unread state for channels and DMs, plus the derived per-hub counts and the
// document title. Converged from the two app copies (client-parity.md): web
// owned unreadDms and seeding from the server, desktop owned persistence, the
// per-hub counts and the tray badge, and both set the same document title from
// their own App.tsx. Everything platform-bound travels in through deps.
export function useUnreadCounts({
  loadPersisted,
  persist,
  onTotalChange,
}: UnreadCountsDeps = {}): UnreadCounts {
  const [unreadByChannel, setUnreadByChannel] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [unreadDms, setUnreadDms] = useState<Record<string, boolean>>({});

  // Persisting from inside a state updater — which is what desktop did — runs
  // twice under StrictMode and writes during render, so it happens in an
  // effect instead. That effect then has to not write back the very map it
  // just restored, and a "have we loaded yet" flag cannot tell: the promise
  // settles before React re-renders, so the flag is already true by the time
  // the effect sees the restored value. The value itself is the reliable
  // marker — nothing else can produce that object.
  // Two guards, and both are needed. `loaded` keeps the empty initial state
  // from being written over the saved one before the read comes back —
  // without it the first effect run clobbers exactly what is being restored.
  const loaded = useRef(!loadPersisted);
  const justRestored = useRef<Record<string, Record<string, boolean>> | null>(null);

  useEffect(() => {
    if (!loadPersisted) return;
    let cancelled = false;
    void loadPersisted()
      .then((saved) => {
        if (cancelled || !saved) return;
        justRestored.current = saved;
        setUnreadByChannel(saved);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) loaded.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [loadPersisted]);

  useEffect(() => {
    if (!persist || !loaded.current) return;
    if (justRestored.current === unreadByChannel) {
      justRestored.current = null;
      return;
    }
    persist(unreadByChannel);
  }, [persist, unreadByChannel]);

  const unreadByHub = useMemo(() => unreadCountsByHub(unreadByChannel), [unreadByChannel]);

  const total = useMemo(() => totalUnread(unreadByHub), [unreadByHub]);

  useEffect(() => {
    document.title = unreadDocumentTitle(total);
    onTotalChange?.(total);
  }, [total, onTotalChange]);

  const bumpUnread = useCallback((hubId: string, channelId: string) => {
    setUnreadByChannel((prev) => bumpChannelUnread(prev, hubId, channelId));
  }, []);

  const clearUnread = useCallback((hubId: string, channelId: string) => {
    setUnreadByChannel((prev) => clearChannelUnread(prev, hubId, channelId));
  }, []);

  const clearHubUnread = useCallback((hubId: string) => {
    setUnreadByChannel((prev) => clearHubChannelUnread(prev, hubId));
  }, []);

  const seedUnreadFromServer = useCallback(
    (hubId: string, counts: { channel_id: string; unread_count: number }[]) => {
      setUnreadByChannel((prev) => seedHubUnread(prev, hubId, counts));
    },
    [],
  );

  return {
    unreadByChannel,
    unreadByHub,
    unreadDms,
    setUnreadDms,
    bumpUnread,
    clearUnread,
    clearHubUnread,
    seedUnreadFromServer,
  };
}
