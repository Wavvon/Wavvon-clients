import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ROLE_ACCENT_COLORS } from "@shared/constants";
import { HEX_RE } from "@shared/utils/roleAppearance";

interface Props {
  value: string | null;
  onChange: (color: string | null) => void;
  noColorLabel: string;
}

export function ColorSwatchPicker({ value, onChange, noColorLabel }: Props) {
  const { t } = useTranslation();
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
        {t("modal.apply")}
      </button>
    </div>
  );
}
