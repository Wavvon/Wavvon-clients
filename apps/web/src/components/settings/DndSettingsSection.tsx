import type { DndSettings } from "@shared/types";

interface Props {
  dnd: DndSettings;
  onChange: (d: DndSettings) => void;
}

export function DndSettingsSection({ dnd, onChange }: Props) {
  const hasSchedule = !!dnd.schedule;

  return (
    <div className="settings-section">
      <label className="settings-label">Quiet hours / Do Not Disturb</label>
      <p className="muted">
        When active, all notification modes are downgraded one step:
        All → Mentions, Mentions → Silent. Per-channel modes are unchanged.
      </p>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={dnd.enabled}
          onChange={(e) => onChange({ ...dnd, enabled: e.target.checked })}
        />
        Enable Do Not Disturb now
      </label>
      <label className="checkbox-label" style={{ marginTop: 8 }}>
        <input
          type="checkbox"
          checked={hasSchedule}
          onChange={(e) =>
            onChange({
              ...dnd,
              schedule: e.target.checked
                ? { start: "22:00", end: "08:00", tz: Intl.DateTimeFormat().resolvedOptions().timeZone }
                : null,
            })
          }
        />
        Scheduled quiet hours
      </label>
      {dnd.schedule && (
        <div className="dnd-schedule" style={{ marginTop: 8 }}>
          <div className="settings-row">
            <label className="settings-label" htmlFor="dnd-start">Start</label>
            <input
              id="dnd-start"
              type="time"
              value={dnd.schedule.start}
              onChange={(e) => onChange({ ...dnd, schedule: { ...dnd.schedule!, start: e.target.value } })}
            />
          </div>
          <div className="settings-row">
            <label className="settings-label" htmlFor="dnd-end">End</label>
            <input
              id="dnd-end"
              type="time"
              value={dnd.schedule.end}
              onChange={(e) => onChange({ ...dnd, schedule: { ...dnd.schedule!, end: e.target.value } })}
            />
          </div>
          <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
            Timezone: {dnd.schedule.tz}
          </p>
        </div>
      )}
    </div>
  );
}
