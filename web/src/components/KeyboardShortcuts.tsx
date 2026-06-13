import React, { useEffect } from "react";
import { FocusTrap } from "./FocusTrap";

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const mod = isMac ? "Cmd" : "Ctrl";

const SHORTCUTS: { binding: string; action: string }[] = [
  { binding: `${mod}+K`, action: "Open channel palette" },
  { binding: "Esc", action: "Close active modal / palette / settings" },
  { binding: "Enter", action: "Send message (composer focused)" },
  { binding: "Shift+Enter", action: "Newline in composer" },
  { binding: "Alt+↑ / Alt+↓", action: "Previous / next channel" },
  { binding: `${mod}+↑ / ${mod}+↓`, action: "Previous / next hub" },
  { binding: `${mod}+,`, action: "Open Settings" },
  { binding: `${mod}+Shift+M`, action: "Toggle self-mute" },
  { binding: `${mod}+Shift+D`, action: "Toggle self-deafen" },
  { binding: `${mod}+Shift+V`, action: "Join / leave voice on selected channel" },
  { binding: `${mod}+/`, action: "Open this cheat-sheet" },
  { binding: `${mod}+F`, action: "Focus channel search" },
  { binding: `${mod}+E`, action: "Open emoji picker on focused message" },
  { binding: "/", action: "Focus composer (when not in a text field)" },
  { binding: "↑ / ↓", action: "Navigate message list (when focused)" },
  { binding: "↑ / ↓", action: "Navigate hub / channel / member lists" },
  { binding: "←", action: "Collapse category (channel list)" },
  { binding: "→", action: "Expand category (channel list)" },
  { binding: "Home / End", action: "Jump to first / last item in a list" },
];

export function KeyboardShortcuts({ onClose }: { onClose: () => void }) {
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
          <h3>Keyboard shortcuts</h3>
          <table className="keyboard-shortcuts-table">
            <thead>
              <tr>
                <th>Binding</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {SHORTCUTS.map((s) => (
                <tr key={`${s.binding}-${s.action}`}>
                  <td><kbd className="kbd">{s.binding}</kbd></td>
                  <td>{s.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="modal-actions" style={{ marginTop: "var(--space-4)" }}>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
