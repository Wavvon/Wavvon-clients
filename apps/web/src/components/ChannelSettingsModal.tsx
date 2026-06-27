import React, { useState } from "react";
import { FocusTrap } from "@wavvon/ui";
import type { Channel } from "@shared/types";

interface Props {
  channel: Channel;
  saving: boolean;
  deleting: boolean;
  error: string | null;
  onSave: (name: string, description: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ChannelSettingsModal({ channel, saving, deleting, error, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty = name.trim() !== channel.name || description.trim() !== (channel.description ?? "");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="channel-settings-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="channel-settings-title">
            {channel.is_category ? "Category Settings" : "Channel Settings"}
          </h3>

          <label style={{ display: "block", marginBottom: "var(--space-2)" }}>
            <span className="label-text">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
              autoFocus
              style={{ display: "block", width: "100%", marginTop: 4 }}
            />
          </label>

          {!channel.is_category && (
            <label style={{ display: "block", marginBottom: "var(--space-3)" }}>
              <span className="label-text">Description (optional)</span>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
                placeholder="What's this channel for?"
                style={{ display: "block", width: "100%", marginTop: 4 }}
              />
            </label>
          )}

          <div className="modal-actions">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button
              onClick={() => onSave(name.trim(), description.trim())}
              disabled={saving || !name.trim() || !dirty}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          <hr style={{ margin: "var(--space-4) 0 var(--space-3)", border: "none", borderTop: "1px solid var(--border)" }} />

          {!confirmDelete ? (
            <button
              className="btn-danger"
              style={{ width: "100%" }}
              onClick={() => setConfirmDelete(true)}
            >
              Delete {channel.is_category ? "category" : "channel"}…
            </button>
          ) : (
            <div>
              <p style={{ marginBottom: "var(--space-2)", color: "var(--danger)" }}>
                This cannot be undone. Delete <strong>{channel.name}</strong>?
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
                <button className="btn-danger" style={{ flex: 1 }} disabled={deleting} onClick={onDelete}>
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
              </div>
            </div>
          )}

          {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
        </div>
      </FocusTrap>
    </div>
  );
}
