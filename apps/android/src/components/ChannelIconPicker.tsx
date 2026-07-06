import React from "react";
import { CHANNEL_ICONS, ChannelIconGlyph } from "./Icons";

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
}

export function ChannelIconPicker({ value, onChange }: Props) {
  return (
    <div className="icon-picker-grid">
      <button
        type="button"
        className={`icon-picker-tile ${value === null ? "selected" : ""}`}
        onClick={() => onChange(null)}
        title="Default (#)"
      >
        <span className="icon-picker-glyph">#</span>
        <span className="icon-picker-label">Default</span>
      </button>
      {CHANNEL_ICONS.map((def) => (
        <button
          key={def.id}
          type="button"
          className={`icon-picker-tile ${value === def.id ? "selected" : ""}`}
          onClick={() => onChange(def.id)}
          title={def.label}
        >
          <span className="icon-picker-glyph">
            <ChannelIconGlyph icon={def.id} size={18} />
          </span>
          <span className="icon-picker-label">{def.label}</span>
        </button>
      ))}
    </div>
  );
}
