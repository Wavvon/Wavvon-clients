import React from "react";
import { createPortal } from "react-dom";
import { FocusTrap } from "../FocusTrap";
import { useCloseOnEscape } from "../../hooks/useCloseOnEscape";

/**
 * The frame for user settings and hub settings: a large dialog over the
 * dimmed app, so closing it lands back where you were. Mounted on
 * document.body, outside any layout rule. Full screen on a phone.
 */
export function SettingsModal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useCloseOnEscape(onClose);

  return createPortal(
    <FocusTrap>
      <div className="settings-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="settings-modal" role="dialog" aria-modal="true">
          {children}
        </div>
      </div>
    </FocusTrap>,
    document.body,
  );
}
