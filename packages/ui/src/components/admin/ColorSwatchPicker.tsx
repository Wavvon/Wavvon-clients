import { useEffect, useState } from "react";
import { HEX_RE } from "../../utils/roleAppearance";

const ROLE_ACCENT_COLORS: string[] = [
  "#e74c3c",
  "#e67e22",
  "#f39c12",
  "#27ae60",
  "#16a085",
  "#2980b9",
  "#8e44ad",
  "#e91e63",
  "#7f8c8d",
];

interface Props {
  value: string | null;
  onChange: (color: string | null) => void;
  noColorLabel: string;
}

export function ColorSwatchPicker({ value, onChange, noColorLabel }: Props) {
  const [hexDraft, setHexDraft] = useState(value ?? "");

  useEffect(() => setHexDraft(value ?? ""), [value]);

  return (
    <div className="color-swatch-row">
      <button
        type="button"
        className={`color-swatch color-swatch-none ${value === null ? "selected" : ""}`}
        onClick={() => onChange(null)}
        title={noColorLabel}
      >
        ✕
      </button>
      {ROLE_ACCENT_COLORS.map((hex) => (
        <button
          key={hex}
          type="button"
          className={`color-swatch ${value === hex ? "selected" : ""}`}
          style={{ background: hex }}
          onClick={() => onChange(hex)}
          title={hex}
        />
      ))}
      <input
        type="text"
        value={hexDraft}
        onChange={(e) => setHexDraft(e.target.value)}
        placeholder="#RRGGBB"
        style={{ width: 90 }}
        maxLength={7}
      />
      <button
        type="button"
        className="btn-small"
        disabled={!HEX_RE.test(hexDraft)}
        onClick={() => onChange(hexDraft)}
      >
        Apply
      </button>
    </div>
  );
}
