import React from "react";
import { useTranslation } from "react-i18next";
import type { Channel } from "@wavvon/core";
import type { NotifyMode } from "../../types";
import { HoverSubmenu } from "../HoverSubmenu";

export interface ChannelContextMenuProps {
  menu: { x: number; y: number; channel: Channel };
  activeHubId: string | null;
  effectiveNotifyMode: (hubId: string, channelId: string) => NotifyMode;
  onSetNotifyMode: (hubId: string, channelId: string, mode: NotifyMode) => void;
  onClose: () => void;
  // Optional entries: an omitted callback hides its entry. Structural rules
  // (which channel kinds an entry makes sense for) live here; permission and
  // ownership gating stays in the app, which passes or omits the callback.
  onCopyLink?: (channel: Channel) => void;
  onCreateEvent?: (channel: Channel) => void;
  onCreatePoll?: (channel: Channel) => void;
  // Temp-room owner rename (temp-voice-channels.md §3): a non-admin owner
  // gets a minimal rename, not the full channel-settings surface. The app
  // gates on is_temporary + ownership + !isAdmin.
  onRenameTempRoom?: (channel: Channel) => void;
  onEditBanner?: (channel: Channel) => void;
  onCreateChannelIn?: (parentId: string) => void;
  onCreateChannel?: () => void;
  onCreateCategory?: () => void;
  onEditChannel?: (channel: Channel) => void;
  onDeleteChannel?: (channel: Channel) => void;
}

const NOTIFY_MODES: NotifyMode[] = ["all", "mentions", "silent"];

// Right-click menu for a channel-sidebar node. One shared surface for web
// and desktop (union of both apps' entries, decisions.md 2026-07-20 — no
// shipped capability drops): each app wires the entries it can serve and
// omits the rest.
export function ChannelContextMenu({
  menu, activeHubId, effectiveNotifyMode, onSetNotifyMode, onClose,
  onCopyLink, onCreateEvent, onCreatePoll, onRenameTempRoom, onEditBanner,
  onCreateChannelIn, onCreateChannel, onCreateCategory,
  onEditChannel, onDeleteChannel,
}: ChannelContextMenuProps) {
  const { t } = useTranslation();
  const { x, y, channel } = menu;

  const notifyModeLabels: Record<NotifyMode, string> = {
    all: t("hub.notifications.all"),
    mentions: t("hub.notifications.mentions"),
    silent: t("hub.notifications.silent"),
  };

  // A banner channel never carries messages, so a notify mode there is dead
  // UI; categories DO get the entry — modes inherit down the channel tree.
  const showNotifications = activeHubId !== null && channel.channel_type !== "banner";
  const isComposerTarget = !channel.is_category && channel.channel_type !== "forum";

  const item = (label: string, onPick: () => void, danger = false) => (
    <button
      className={danger ? "context-menu-item danger" : "context-menu-item"}
      onClick={() => { onClose(); onPick(); }}
    >
      {label}
    </button>
  );

  const memberEntries = [
    showNotifications && (
      <HoverSubmenu
        key="notify"
        trigger={<button className="context-menu-item context-menu-submenu-trigger">{t("channel.ctx.notifications")} ▸</button>}
        triggerClassName="context-menu-submenu-wrap"
      >
        {NOTIFY_MODES.map((mode) => {
          const cur = effectiveNotifyMode(activeHubId!, channel.id);
          return (
            <button
              key={mode}
              className="context-menu-item context-menu-subitem"
              onClick={() => { onClose(); onSetNotifyMode(activeHubId!, channel.id, mode); }}
            >
              {cur === mode ? "✓ " : "   "}{notifyModeLabels[mode]}
            </button>
          );
        })}
      </HoverSubmenu>
    ),
    !channel.is_category && onCopyLink &&
      item(t("channel.ctx.copy_link"), () => onCopyLink(channel)),
    isComposerTarget && onCreateEvent &&
      item(t("channel.ctx.create_event"), () => onCreateEvent(channel)),
    isComposerTarget && onCreatePoll &&
      item(t("channel.ctx.create_poll"), () => onCreatePoll(channel)),
    !channel.is_category && onRenameTempRoom &&
      item(t("channel.temp.rename"), () => onRenameTempRoom(channel)),
    channel.channel_type === "banner" && onEditBanner &&
      item(t("channel.ctx.edit_banner"), () => onEditBanner(channel)),
  ].filter(Boolean);

  const createEntries = [
    channel.is_category && onCreateChannelIn &&
      item(t("channel.ctx.create_in", { name: channel.name }), () => onCreateChannelIn(channel.id)),
    onCreateChannel && item(t("channel.create.button"), onCreateChannel),
    onCreateCategory && item(t("channel.ctx.create_category"), onCreateCategory),
  ].filter(Boolean);

  const manageEntries = [
    onEditChannel &&
      item(t("channel.ctx.edit_name", { name: channel.name }), () => onEditChannel(channel)),
    onDeleteChannel &&
      item(t("channel.ctx.delete_name", { name: channel.name }), () => onDeleteChannel(channel), true),
  ].filter(Boolean);

  const divider = (key: string) => (
    <hr key={key} style={{ margin: "4px 0", border: "none", borderTop: "1px solid var(--border)" }} />
  );

  const groups = [memberEntries, createEntries, manageEntries].filter((g) => g.length > 0);

  return (
    <div
      className="context-menu-overlay"
      onClick={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
    >
      <div
        className="context-menu"
        style={{ top: y, left: x }}
        onClick={(e) => e.stopPropagation()}
      >
        {groups.map((g, i) => (
          <React.Fragment key={i}>
            {i > 0 && divider(`div-${i}`)}
            {g}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
