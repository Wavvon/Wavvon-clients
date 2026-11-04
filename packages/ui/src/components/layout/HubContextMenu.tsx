import React from "react";
import { useTranslation } from "react-i18next";
import type { Hub, NotifyMode } from "../../types";

/** Right-click menu of a hub, wherever the hub is shown: notifications and removal. */
export function HubContextMenu({ hub, x, y, mode, onSetMode, onRemove, onClose }: {
  hub: Hub;
  x: number;
  y: number;
  mode: NotifyMode;
  onSetMode?: (hubId: string, mode: NotifyMode) => void;
  onRemove: (hubId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
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
        role="menu"
        aria-label={hub.hub_name}
      >
        <div className="context-menu-header">{hub.hub_name}</div>
        {onSetMode && (
          <>
            <div className="context-menu-subheader">{t("hub.notifications")}</div>
            {(["all", "mentions", "silent"] as NotifyMode[]).map((m) => (
              <button
                key={m}
                className={`context-menu-item${mode === m ? " context-menu-item-active" : ""}`}
                role="menuitemradio"
                aria-checked={mode === m}
                onClick={() => { onSetMode(hub.hub_id, m); onClose(); }}
              >
                {t(`hub.notifications.${m}`)}
              </button>
            ))}
            <div className="context-menu-separator" />
          </>
        )}
        <button className="context-menu-item danger" role="menuitem" onClick={() => { onClose(); onRemove(hub.hub_id); }}>
          {t("hub.leave")}
        </button>
      </div>
    </div>
  );
}
