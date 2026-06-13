import React from "react";
import type { Channel, NotifyMode } from "../types";
import { HoverSubmenu } from "@voxply/ui";

interface Props {
  menu: { x: number; y: number; channel: Channel };
  activeHubId: string | null;
  effectiveNotifyMode: (hubId: string, channelId: string) => NotifyMode;
  onClose: () => void;
  onRename: (channel: Channel) => void;
  onSetMode: (hubId: string, channelId: string, mode: NotifyMode) => void;
  onOpenCreateChannel: (parentId: string | null, isCategory: boolean) => void;
  onEditAppearance: (channel: Channel) => void;
  onDelete: (channelId: string) => void;
}

export function ChannelContextMenu({
  menu, activeHubId, effectiveNotifyMode,
  onClose, onRename,
  onSetMode, onOpenCreateChannel, onEditAppearance, onDelete,
}: Props) {
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
        {!channel.is_category && (
          <button
            className="context-menu-item"
            onClick={() => { onClose(); onRename(channel); }}
          >
            Rename channel…
          </button>
        )}
        {channel.is_category && (
          <>
            <button
              className="context-menu-item"
              onClick={() => { onClose(); onOpenCreateChannel(channel.id, false); }}
            >
              Create channel here…
            </button>
            <button
              className="context-menu-item"
              onClick={() => { onClose(); onOpenCreateChannel(channel.id, true); }}
            >
              Create subcategory here…
            </button>
            <button
              className="context-menu-item"
              onClick={() => { onClose(); onEditAppearance(channel); }}
            >
              Edit appearance…
            </button>
          </>
        )}
        {activeHubId && (
          <HoverSubmenu
            trigger={<button className="context-menu-item context-menu-submenu-trigger">Notifications ▸</button>}
            triggerClassName="context-menu-submenu-wrap"
          >
            {activeHubId && (() => {
              const cur = effectiveNotifyMode(activeHubId, channel.id);
              return ([
                { mode: "all" as NotifyMode, label: "All messages" },
                { mode: "mentions" as NotifyMode, label: "Only @mentions" },
                { mode: "silent" as NotifyMode, label: "Silent" },
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
          Delete {channel.is_category ? "category" : "channel"}
        </button>
      </div>
    </div>
  );
}
