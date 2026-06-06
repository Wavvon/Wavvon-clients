import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HubEvent } from "../types";

interface Props {
  hubUrl: string;
  onCreated: (event: HubEvent) => void;
  onClose: () => void;
}

export function EventComposer({ hubUrl, onCreated, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startsAt) {
      setError("Title and start time are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const startsAtTs = Math.floor(new Date(startsAt).getTime() / 1000);
      const endsAtTs = endsAt ? Math.floor(new Date(endsAt).getTime() / 1000) : null;
      const event = await invoke<HubEvent>("create_event_hub", {
        hubUrl,
        title: title.trim(),
        description: description.trim(),
        startsAt: startsAtTs,
        endsAt: endsAtTs,
        channelId: null,
        location: location.trim() || null,
      });
      onCreated(event);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="events-panel-overlay" onClick={onClose}>
      <div
        className="events-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Create event"
        style={{ maxWidth: 480 }}
      >
        <div className="events-panel-header">
          <span className="events-panel-title">📅 Create Event</span>
          <button className="events-panel-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <form
          className="events-panel-body"
          onSubmit={handleSubmit}
          style={{ gap: 12, display: "flex", flexDirection: "column", padding: 16 }}
        >
          <label className="settings-label">
            Title
            <input
              className="settings-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              required
            />
          </label>

          <label className="settings-label">
            Description
            <textarea
              className="settings-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's happening?"
              rows={3}
              style={{ resize: "vertical" }}
            />
          </label>

          <label className="settings-label">
            Start time
            <input
              className="settings-input"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
            />
          </label>

          <label className="settings-label">
            End time (optional)
            <input
              className="settings-input"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </label>

          <label className="settings-label">
            Location (optional)
            <input
              className="settings-input"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Where?"
            />
          </label>

          {error && <div className="events-panel-error">{error}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Creating…" : "Create Event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
