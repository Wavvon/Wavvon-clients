import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FocusTrap } from "./FocusTrap";

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const mod = isMac ? "Cmd" : "Ctrl";

// Each action is the catalog key `shortcuts.action.<id>`. Two rows share the
// same binding, so the id is what keeps them distinct as React keys too.
const SHORTCUTS: { binding: string; id: string }[] = [
  { binding: `${mod}+K`, id: "palette" },
  { binding: "Esc", id: "close" },
  { binding: "Enter", id: "send" },
  { binding: "Shift+Enter", id: "newline" },
  { binding: "Alt+↑ / Alt+↓", id: "channel_prev_next" },
  { binding: `${mod}+↑ / ${mod}+↓`, id: "hub_prev_next" },
  { binding: `${mod}+,`, id: "settings" },
  { binding: `${mod}+Shift+M`, id: "mute" },
  { binding: `${mod}+Shift+D`, id: "deafen" },
  { binding: `${mod}+Shift+V`, id: "voice" },
  { binding: `${mod}+/`, id: "cheatsheet" },
  { binding: `${mod}+F`, id: "search" },
  { binding: `${mod}+E`, id: "emoji" },
  { binding: "/", id: "composer" },
  { binding: "↑ / ↓", id: "messages" },
  { binding: "↑ / ↓", id: "lists" },
  { binding: "←", id: "collapse" },
  { binding: "→", id: "expand" },
  { binding: "Home / End", id: "home_end" },
];

export function KeyboardShortcuts({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
        <div className="modal keyboard-shortcuts-modal" onClick={(e) => e.stopPropagation()}>
          <h3>{t("shortcuts.title")}</h3>
          <table className="keyboard-shortcuts-table">
            <thead>
              <tr>
                <th>{t("shortcuts.col.binding")}</th>
                <th>{t("shortcuts.col.action")}</th>
              </tr>
            </thead>
            <tbody>
              {SHORTCUTS.map((s) => (
                <tr key={`${s.binding}-${s.id}`}>
                  <td><kbd className="kbd">{s.binding}</kbd></td>
                  <td>{t(`shortcuts.action.${s.id}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="modal-actions" style={{ marginTop: "var(--space-4)" }}>
            <button onClick={onClose}>{t("modal.close")}</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
