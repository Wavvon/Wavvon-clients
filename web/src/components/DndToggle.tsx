import type { DndSettings } from "../types";

interface Props {
  dnd: DndSettings;
  onChange: (d: DndSettings) => void;
}

export function DndToggle({ dnd, onChange }: Props) {
  return (
    <button
      className={`btn-icon-gear dnd-toggle ${dnd.enabled ? "active" : ""}`}
      aria-pressed={dnd.enabled}
      title={dnd.enabled ? "Do Not Disturb active — click to disable" : "Enable Do Not Disturb"}
      onClick={() => onChange({ ...dnd, enabled: !dnd.enabled })}
    >
      🌙
    </button>
  );
}
