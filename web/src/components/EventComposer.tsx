import React, { useState } from "react";
import type { HubEvent } from "../types";
import { createEvent } from "@platform";

interface Props {
  onCreated: (event: HubEvent) => void;
  onClose: () => void;
}

export function EventComposer({ onCreated, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startAt) {
      setError("Title and start date/time are required.");
      return;
    }
    const startMs = new Date(startAt).getTime();
    if (isNaN(startMs)) {
      setError("Invalid start date.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const event = await createEvent({
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        start_at: Math.floor(startMs / 1000),
        end_at: endAt ? Math.floor(new Date(endAt).getTime() / 1000) : null,
      });
      onCreated(event);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Create event"
    >
      <div
        className="modal-box"
        style={{ maxWidth: 440, padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 16px", fontSize: "var(--text-md)", fontWeight: 600 }}>
          Create event
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="settings-section" style={{ marginBottom: 10 }}>
            <label className="settings-label" htmlFor="event-title">Title</label>
            <input
              id="event-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              style={{ width: "100%" }}
              autoFocus
            />
          </div>

          <div className="settings-section" style={{ marginBottom: 10 }}>
            <label className="settings-label" htmlFor="event-description">Description</label>
            <textarea
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={3}
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>

          <div className="settings-section" style={{ marginBottom: 10 }}>
            <label className="settings-label" htmlFor="event-location">Location</label>
            <input
              id="event-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Optional location"
              style={{ width: "100%" }}
            />
          </div>

          <div className="settings-row" style={{ display: "flex", gap: 12, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="settings-label" htmlFor="event-start">Start</label>
              <input
                id="event-start"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="settings-label" htmlFor="event-end">End (optional)</label>
              <input
                id="event-end"
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          {error && <p style={{ color: "var(--danger)", fontSize: "var(--text-sm)", marginBottom: 8 }}>{error}</p>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Creating…" : "Create event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
