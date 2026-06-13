import { THEMES } from "../constants";
import type { ThemeId, VoxplySkin } from "../skinValidation";

export function ThemePicker({
  value,
  skin,
  onChange,
}: {
  value: ThemeId;
  skin: VoxplySkin | null;
  onChange: (t: ThemeId) => void;
}) {
  return (
    <div className="theme-cards">
      {THEMES.map((t) => {
        const isCustom = t.id === "custom";
        const swatches =
          isCustom && skin
            ? [
                skin.tokens["--bg"] ?? skin.tokens["--surface"] ?? t.swatches[0],
                skin.tokens["--surface"] ?? t.swatches[1],
                skin.tokens["--accent"] ?? t.swatches[2],
              ]
            : t.swatches;
        const label = isCustom && skin ? skin.name : t.name;
        const tagline = isCustom && skin
          ? `Based on ${skin.base}`
          : t.tagline;

        return (
          <button
            key={t.id}
            className={`theme-card ${value === t.id ? "active" : ""}`}
            onClick={() => onChange(t.id)}
            type="button"
          >
            {t.id === "calm" && <span className="theme-card-default">Default</span>}
            <div className="theme-card-name">{label}</div>
            <div className="theme-card-swatches">
              {swatches.map((color, i) => (
                <span
                  key={i}
                  className="theme-swatch"
                  style={{ background: color }}
                />
              ))}
            </div>
            <p className="theme-card-tagline">{tagline}</p>
          </button>
        );
      })}
    </div>
  );
}
