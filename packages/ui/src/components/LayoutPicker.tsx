import { useTranslation } from "react-i18next";
import { LAYOUT_KEYS, LAYOUT_OPTIONS, type LayoutChoice, type LayoutKey } from "../themes/layout";

interface Props {
  value: LayoutChoice;
  unsetLabel: string;
  onChange: (key: LayoutKey, value: string | null) => void;
}

export function LayoutPicker({ value, unsetLabel, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <>
      {LAYOUT_KEYS.map((key) => (
        <div key={key} className="settings-row" style={{ alignItems: "center" }}>
          <label style={{ flex: 1, fontSize: "var(--text-sm)" }} htmlFor={`layout-${key}`}>{t(`settings.theme.layout.${key}`)}</label>
          <select id={`layout-${key}`} value={value[key] ?? ""} onChange={(e) => onChange(key, e.target.value || null)}>
            <option value="">{unsetLabel}</option>
            {LAYOUT_OPTIONS[key].map((o) => (
              <option key={o} value={o}>{t(`settings.theme.layout.${key}.${o}`)}</option>
            ))}
          </select>
        </div>
      ))}
    </>
  );
}
