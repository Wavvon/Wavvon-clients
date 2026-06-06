import React, { useEffect } from "react";
import type { Channel } from "../types";
import { FocusTrap } from "./FocusTrap";

interface Props {
  channel: Channel;
  description: string;
  onDescriptionChange: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export function EditDescriptionModal({ channel, description, onDescriptionChange, onSave, onClose }: Props) {
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
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-desc-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="edit-desc-title">Edit description — #{channel.name}</h3>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="What's this channel for?"
          rows={4}
          autoFocus
        />
        <div className="modal-actions">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={onSave}>Save</button>
        </div>
      </div>
      </FocusTrap>
    </div>
  );
}
