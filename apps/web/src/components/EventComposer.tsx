import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { HubEvent } from "../types";
import { createEvent } from "@platform";
import { reminderOffsetToMinutes, REMINDER_OFFSETS, type ReminderOffset } from "../utils/events";
import { EventSlotEditor, type SlotRow } from "./EventSlotEditor";

interface Props {
  channelId: string;
  onCreated: () => void;
  onClose: () => void;
}

function newSlotRow(): SlotRow {
  return { key: crypto.randomUUID(), name: "", capacity: "" };
}

export function EventComposer({ channelId, onCreated, onClose }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [reminderOffset, setReminderOffset] = useState<ReminderOffset>("off");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addSlot() {
    setSlots((prev) => [...prev, newSlotRow()]);
  }

  function removeSlot(key: string) {
    setSlots((prev) => prev.filter((s) => s.key !== key));
  }

  function updateSlot(key: string, patch: Partial<SlotRow>) {
    setSlots((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

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
    const namedSlots = slots.filter((s) => s.name.trim());
    setSaving(true);
    setError(null);
    try {
      await createEvent({
        channel_id: channelId,
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        starts_at: Math.floor(startMs / 1000),
        ends_at: endAt ? Math.floor(new Date(endAt).getTime() / 1000) : null,
        reminder_minutes: reminderOffsetToMinutes(reminderOffset),
        slots: namedSlots.map((s) => ({
          name: s.name.trim(),
          capacity: s.capacity.trim() ? Number(s.capacity) : undefined,
        })),
      });
      onCreated();
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

          {/* minWidth: 0 lets each half shrink below the datetime input's
              large intrinsic width — without it the row overflows the modal
              and renders wider than the single-column fields above. */}
          <div className="settings-row" style={{ display: "flex", gap: 12, marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label className="settings-label" htmlFor="event-start">Start</label>
              <input
                id="event-start"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label className="settings-label" htmlFor="event-end">End (optional)</label>
              <input
                id="event-end"
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}
              />
            </div>
          </div>

          <div className="settings-section" style={{ marginBottom: 10 }}>
            <label className="settings-label" htmlFor="event-reminder">
              {t("events.reminder.label")}
            </label>
            <select
              id="event-reminder"
              value={reminderOffset}
              onChange={(e) => setReminderOffset(e.target.value as ReminderOffset)}
              style={{ width: "100%" }}
            >
              {REMINDER_OFFSETS.map((offset) => (
                <option key={offset} value={offset}>
                  {t(`events.reminder.${offset}`)}
                </option>
              ))}
            </select>
          </div>

          <EventSlotEditor slots={slots} onAdd={addSlot} onRemove={removeSlot} onUpdate={updateSlot} />

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
