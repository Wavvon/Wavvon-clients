import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { HoverSubmenu } from "./HoverSubmenu";

export interface VoiceMoveChannelOption {
  id: string;
  name: string;
}

interface Props {
  displayName: string;
  position: { x: number; y: number };
  channels: VoiceMoveChannelOption[];
  onMove: (channelId: string) => void;
  onClose: () => void;
}

/** Right-click menu on a voice roster participant — a single "Move to
 *  channel…" entry that reveals the channel picker as a hover submenu
 *  (events.md §7.1 Phase 1 client surface). */
export function VoiceMoveMenu({ displayName, position, channels, onMove, onClose }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="context-menu-overlay"
      onClick={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9998 }}
    >
      <div
        className="context-menu"
        style={{ position: "fixed", top: position.y, left: position.x, zIndex: 9999, minWidth: 200 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="context-menu-header">{displayName}</div>
        <HoverSubmenu
          trigger={<button className="context-menu-item context-menu-submenu-trigger">{t("voice.move.menu_item")} ▸</button>}
        >
          {channels.length === 0 ? (
            <div style={{ padding: "6px 14px", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
              {t("voice.move.no_channels")}
            </div>
          ) : (
            channels.map((c) => (
              <button
                key={c.id}
                className="context-menu-item context-menu-subitem"
                onClick={() => { onMove(c.id); onClose(); }}
              >
                {c.name}
              </button>
            ))
          )}
        </HoverSubmenu>
      </div>
    </div>
  );
}
