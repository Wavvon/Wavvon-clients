import React from "react";
import type { DndSettings } from "../types";

interface Props {
  dnd: DndSettings;
  onChange: (s: DndSettings) => void;
}

export function DndSection({ dnd, onChange }: Props) {
  return (
    <div className="dnd-section settings-section">
      <label className="settings-label">Do not disturb</label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={dnd.enabled}
          onChange={(e) => onChange({ ...dnd, enabled: e.target.checked })}
        />
        Enable Do Not Disturb (downgrades all channels by one notification level)
      </label>

      <div style={{ marginTop: 12 }}>
        <label className="settings-label">Quiet hours schedule</label>
        <p className="muted">While inside this window, DND is on automatically.</p>
        {dnd.schedule ? (
          <div>
            <div className="settings-row">
              <label htmlFor="dnd-start">Start:</label>
              <input
                id="dnd-start"
                type="time"
                value={dnd.schedule.start}
                onChange={(e) => onChange({ ...dnd, schedule: { ...dnd.schedule!, start: e.target.value } })}
              />
            </div>
            <div className="settings-row" style={{ marginTop: 6 }}>
              <label htmlFor="dnd-end">End:</label>
              <input
                id="dnd-end"
                type="time"
                value={dnd.schedule.end}
                onChange={(e) => onChange({ ...dnd, schedule: { ...dnd.schedule!, end: e.target.value } })}
              />
            </div>
            <button
              className="btn-secondary"
              onClick={() => onChange({ ...dnd, schedule: null })}
              style={{ marginTop: 8 }}
            >
              Remove schedule
            </button>
          </div>
        ) : (
          <button
            className="btn-secondary"
            onClick={() => onChange({ ...dnd, schedule: { start: "22:00", end: "08:00", tz: Intl.DateTimeFormat().resolvedOptions().timeZone } })}
          >
            Add quiet hours schedule
          </button>
        )}
      </div>
    </div>
  );
}
