import React from "react";
import { FocusTrap } from "./FocusTrap";

interface Props {
  name: string;
  onNameChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  isCategory: boolean;
  onIsCategoryChange: (v: boolean) => void;
  parentId: string | null;
  onCreate: () => void;
  onClose: () => void;
}

export function CreateChannelModal({
  name, onNameChange, description, onDescriptionChange,
  isCategory, onIsCategoryChange, parentId, onCreate, onClose,
}: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-channel-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="create-channel-title">
          Create…{parentId ? " (inside category)" : ""}
        </h3>
        <p className="modal-section-label">Space type</p>
        <div className="channel-type-row">
          <button
            type="button"
            className={`channel-type-btn ${!isCategory ? "selected" : ""}`}
            onClick={() => onIsCategoryChange(false)}
          >
            Channel
          </button>
          <button
            type="button"
            className={`channel-type-btn ${isCategory ? "selected" : ""}`}
            onClick={() => onIsCategoryChange(true)}
          >
            Category
          </button>
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCreate();
            if (e.key === "Escape") onClose();
          }}
          placeholder={isCategory ? "category-name" : "channel-name"}
          maxLength={64}
          autoFocus
        />
        {!isCategory && (
          <textarea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Channel description (optional) — shown in the channel header"
            rows={3}
            maxLength={280}
          />
        )}
        <div className="modal-actions">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={onCreate}>Create</button>
        </div>
      </div>
      </FocusTrap>
    </div>
  );
}
