import React from "react";
import { createPortal } from "react-dom";
import { FocusTrap } from "../FocusTrap";
import { useCloseOnEscape } from "../../hooks/useCloseOnEscape";

/**
 * A window of its own for bringing an identity onto this device, drawn over
 * whatever opened it (Settings) instead of reflowing it.
 */
export function IdentityModal({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  useCloseOnEscape(onClose, true);
  return createPortal(
    <div className="modal-overlay identity-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <FocusTrap>
        <div className="identity-modal" role="dialog" aria-modal="true" aria-label={label}>
          {children}
        </div>
      </FocusTrap>
    </div>,
    document.body,
  );
}
