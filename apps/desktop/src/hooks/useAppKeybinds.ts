import { useEffect } from "react";
import type { Channel, Hub } from "../types";
import type { useChannelMessages } from "./useChannelMessages";
import type { useDms } from "./useDms";
import type { useHubLifecycle } from "./useHubLifecycle";
import type { useVoice } from "./useVoice";

interface AppKeybindsParams {
  hubs: Hub[];
  activeHubId: string | null;
  channels: Channel[];
  view: ReturnType<typeof useDms>["view"];
  setView: ReturnType<typeof useDms>["setView"];
  voice: ReturnType<typeof useVoice>;
  channelMessages: ReturnType<typeof useChannelMessages>;
  unreadByChannel: Record<string, Record<string, boolean>>;
  contextMenu: { x: number; y: number; channel: Channel } | null;
  setContextMenu: (v: { x: number; y: number; channel: Channel } | null) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  setShowKeyboardShortcuts: (update: (v: boolean) => boolean) => void;
  handleSwitchHub: ReturnType<typeof useHubLifecycle>["handleSwitchHub"];
  openSettings: () => Promise<void>;
  leaveVoiceChannel: () => void;
}

export function useAppKeybinds({
  hubs,
  activeHubId,
  channels,
  view,
  setView,
  voice,
  channelMessages,
  unreadByChannel,
  contextMenu,
  setContextMenu,
  paletteOpen,
  setPaletteOpen,
  setShowKeyboardShortcuts,
  handleSwitchHub,
  openSettings,
  leaveVoiceChannel,
}: AppKeybindsParams) {
  useEffect(() => {
    function isTextInput(el: Element | null): boolean {
      if (!el) return false;
      const tag = (el as HTMLElement).tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
    }

    function onKey(e: KeyboardEvent) {
      const meta = e.ctrlKey || e.metaKey;
      const inText = isTextInput(document.activeElement);

      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (meta && e.key === "/") {
        e.preventDefault();
        setShowKeyboardShortcuts((v) => !v);
        return;
      }

      if (meta && e.key === ",") {
        e.preventDefault();
        openSettings();
        return;
      }

      if (meta && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        voice.toggleSelfMute();
        return;
      }

      if (meta && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        voice.toggleSelfDeafen();
        return;
      }

      if (meta && e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        if (voice.voiceChannelId) {
          leaveVoiceChannel();
        } else if (channelMessages.selectedChannel && !channelMessages.selectedChannel.is_category) {
          voice.handleVoiceJoin(channelMessages.selectedChannel);
        }
        return;
      }

      if (meta && e.key === "ArrowUp") {
        e.preventDefault();
        const idx = hubs.findIndex((h) => h.hub_id === activeHubId);
        if (idx > 0) {
          const prev = hubs[idx - 1];
          handleSwitchHub(prev.hub_id);
          setView("channels");
        }
        return;
      }

      if (meta && e.key === "ArrowDown") {
        e.preventDefault();
        const idx = hubs.findIndex((h) => h.hub_id === activeHubId);
        if (idx >= 0 && idx < hubs.length - 1) {
          const next = hubs[idx + 1];
          handleSwitchHub(next.hub_id);
          setView("channels");
        }
        return;
      }

      if (e.altKey && e.key === "ArrowUp") {
        e.preventDefault();
        if (view === "channels" && activeHubId) {
          const unreadSet = unreadByChannel[activeHubId] ?? {};
          const unreadChannels = channels.filter((c) => !c.is_category && unreadSet[c.id]);
          if (unreadChannels.length > 0) {
            const idx = channelMessages.selectedChannel
              ? unreadChannels.findIndex((c) => c.id === channelMessages.selectedChannel!.id)
              : -1;
            const prev = idx > 0 ? unreadChannels[idx - 1] : unreadChannels[unreadChannels.length - 1];
            channelMessages.selectChannel(prev);
          }
        }
        return;
      }

      if (e.altKey && e.key === "ArrowDown") {
        e.preventDefault();
        if (view === "channels" && activeHubId) {
          const unreadSet = unreadByChannel[activeHubId] ?? {};
          const unreadChannels = channels.filter((c) => !c.is_category && unreadSet[c.id]);
          if (unreadChannels.length > 0) {
            const idx = channelMessages.selectedChannel
              ? unreadChannels.findIndex((c) => c.id === channelMessages.selectedChannel!.id)
              : -1;
            const next = idx >= 0 && idx < unreadChannels.length - 1
              ? unreadChannels[idx + 1]
              : unreadChannels[0];
            channelMessages.selectChannel(next);
          }
        }
        return;
      }

      if (meta && e.key.toLowerCase() === "f" && !inText) {
        e.preventDefault();
        channelMessages.setSearchOpen(true);
        return;
      }

      if (e.key === "/" && !inText && !meta) {
        e.preventDefault();
        channelMessages.messageInputRef.current?.focus();
        return;
      }

      if (e.key === "Escape") {
        if (contextMenu) { setContextMenu(null); return; }
        if (paletteOpen) { setPaletteOpen(false); return; }
        if (channelMessages.replyTarget) { channelMessages.setReplyTarget(null); return; }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hubs, activeHubId, channelMessages.selectedChannel, channels, view, voice, unreadByChannel, contextMenu, paletteOpen, channelMessages.replyTarget]);
}
