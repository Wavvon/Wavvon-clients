import React from "react";
import { useTranslation } from "react-i18next";
import type { Channel, NotifyMode } from "../types";
import { HoverSubmenu } from "@wavvon/ui";

interface Props {
  menu: { x: number; y: number; channel: Channel };
  activeHubId: string | null;
  effectiveNotifyMode: (hubId: string, channelId: string) => NotifyMode;
  onClose: () => void;
  onRename: (channel: Channel) => void;
  onSetMode: (hubId: string, channelId: string, mode: NotifyMode) => void;
  onOpenCreateChannel: (parentId: string | null) => void;
  onEditAppearance: (channel: Channel) => void;
  onDelete: (channelId: string) => void;
  onEditBanner?: (channel: Channel) => void;
}

export function ChannelContextMenu({
  menu, activeHubId, effectiveNotifyMode,
  onClose, onRename,
  onSetMode, onOpenCreateChannel, onEditAppearance, onDelete, onEditBanner,
}: Props) {
  const { t } = useTranslation();
  const { x, y, channel } = menu;

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
        {channel.channel_type === "banner" && onEditBanner && (
          <button
            className="context-menu-item"
            onClick={() => { onClose(); onEditBanner(channel); }}
          >
            {t("channel.ctx.edit_banner")}
          </button>
        )}
        {!channel.is_category && channel.channel_type !== "banner" && (
          <button
            className="context-menu-item"
            onClick={() => { onClose(); onRename(channel); }}
          >
            {t("channel.ctx.rename")}
          </button>
        )}
        {channel.is_category && (
          <>
            <button
              className="context-menu-item"
              onClick={() => { onClose(); onOpenCreateChannel(channel.id); }}
            >
              {t("channel.ctx.create_here")}
            </button>
            <button
              className="context-menu-item"
              onClick={() => { onClose(); onEditAppearance(channel); }}
            >
              {t("channel.ctx.appearance")}
            </button>
          </>
        )}
        {activeHubId && channel.channel_type !== "banner" && (
          <HoverSubmenu
            trigger={<button className="context-menu-item context-menu-submenu-trigger">{t("channel.ctx.notifications")} ▸</button>}
            triggerClassName="context-menu-submenu-wrap"
          >
            {activeHubId && (() => {
              const cur = effectiveNotifyMode(activeHubId, channel.id);
              return ([
                { mode: "all" as NotifyMode, label: t("hub.notifications.all") },
                { mode: "mentions" as NotifyMode, label: t("hub.notifications.mentions") },
                { mode: "silent" as NotifyMode, label: t("hub.notifications.silent") },
              ]).map(({ mode, label }) => (
                <button key={mode} className="context-menu-item context-menu-subitem"
                  onClick={() => { onClose(); onSetMode(activeHubId, channel.id, mode); }}>
                  {cur === mode ? "✓ " : "   "}{label}
                </button>
              ));
            })()}
          </HoverSubmenu>
        )}
        <button
          className="context-menu-item danger"
          onClick={() => onDelete(channel.id)}
        >
          {t("channel.ctx.delete", { type: channel.is_category ? t("channel.ctx.type_category") : t("channel.ctx.type_channel") })}
        </button>
      </div>
    </div>
  );
}
