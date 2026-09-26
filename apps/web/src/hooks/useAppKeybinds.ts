import { useEffect } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Channel, Hub } from "@shared/types";

export interface UseAppKeybindsParams {
  hubs: Hub[];
  channels: Channel[];
  selectedChannel: Channel | null;
  messageInputRef: RefObject<HTMLInputElement | null>;
  unreadByChannel: Record<string, Record<string, boolean>>;
  activeHubIdRef: RefObject<string | null>;
  setActiveHubIdState: Dispatch<SetStateAction<string | null>>;
  handleSelectChannel: (ch: Channel) => void | Promise<void>;
  showKeyboardShortcuts: boolean;
  setShowKeyboardShortcuts: Dispatch<SetStateAction<boolean>>;
  showSettings: boolean;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  showHubAdmin: boolean;
  setShowHubAdmin: Dispatch<SetStateAction<boolean>>;
  showAddHub: boolean;
  setShowAddHub: Dispatch<SetStateAction<boolean>>;
  showQuickInvite: boolean;
  setShowQuickInvite: Dispatch<SetStateAction<boolean>>;
  showSearchBar: boolean;
  setShowSearchBar: Dispatch<SetStateAction<boolean>>;
  searchOpen: boolean;
  setSearchOpen: Dispatch<SetStateAction<boolean>>;
}

// Global keyboard shortcuts: mod+/ shortcuts help, mod+, settings, mod+K
// search bar, mod+F in-channel search, mod+Up/Down hub switch, "/" focus the
// composer, alt+Up/Down unread channel nav, Escape closes whatever overlay is
// topmost.
export function useAppKeybinds({
  hubs, channels, selectedChannel, messageInputRef, unreadByChannel, activeHubIdRef,
  setActiveHubIdState, handleSelectChannel,
  showKeyboardShortcuts, setShowKeyboardShortcuts,
  showSettings, setShowSettings,
  showHubAdmin, setShowHubAdmin,
  showAddHub, setShowAddHub,
  showQuickInvite, setShowQuickInvite,
  showSearchBar, setShowSearchBar,
  searchOpen, setSearchOpen,
}: UseAppKeybindsParams) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;

      if (mod && e.key === "/") {
        e.preventDefault();
        setShowKeyboardShortcuts((v) => !v);
        return;
      }
      if (mod && e.key === ",") {
        e.preventDefault();
        setShowSettings((v) => !v);
        return;
      }
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowSearchBar((v) => !v);
        return;
      }
      if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }
      if (mod && e.key === "ArrowDown") {
        e.preventDefault();
        setActiveHubIdState((prev) => {
          const idx = hubs.findIndex((h) => h.hub_id === prev);
          const next = hubs[idx + 1];
          return next ? next.hub_id : prev;
        });
        return;
      }
      if (mod && e.key === "ArrowUp") {
        e.preventDefault();
        setActiveHubIdState((prev) => {
          const idx = hubs.findIndex((h) => h.hub_id === prev);
          const next = hubs[idx - 1];
          return next ? next.hub_id : prev;
        });
        return;
      }
      if (!inInput && e.key === "/") {
        e.preventDefault();
        messageInputRef.current?.focus();
        return;
      }
      if (e.altKey && (e.code === "ArrowDown" || e.code === "ArrowUp")) {
        e.preventDefault();
        const hubId = activeHubIdRef.current;
        const unreadSet = hubId ? (unreadByChannel[hubId] ?? {}) : {};
        const visibleChannels = channels.filter((c) => !c.is_category);
        const unreadChannels = visibleChannels.filter((c) => unreadSet[c.id]);
        const pool = unreadChannels.length > 0 ? unreadChannels : visibleChannels;
        const idx = pool.findIndex((c) => c.id === selectedChannel?.id);
        const next = e.code === "ArrowDown"
          ? pool[(idx + 1) % pool.length]
          : pool[(idx - 1 + pool.length) % pool.length];
        if (next) void handleSelectChannel(next);
        return;
      }
      if (e.key === "Escape" && !inInput) {
        if (showKeyboardShortcuts) { setShowKeyboardShortcuts(false); return; }
        if (showSettings) { setShowSettings(false); return; }
        if (showHubAdmin) { setShowHubAdmin(false); return; }
        if (showAddHub) { setShowAddHub(false); return; }
        if (showQuickInvite) { setShowQuickInvite(false); return; }
        if (showSearchBar) { setShowSearchBar(false); return; }
        if (searchOpen) { setSearchOpen(false); return; }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hubs, channels, selectedChannel, messageInputRef, unreadByChannel, showKeyboardShortcuts, showSettings, showHubAdmin, showAddHub, showQuickInvite, showSearchBar, searchOpen]);
}
