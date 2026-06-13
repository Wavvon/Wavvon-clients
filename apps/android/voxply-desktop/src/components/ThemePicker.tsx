import { THEMES } from "../constants";
import type { ThemeId, VoxplySkin } from "../skinValidation";

export function ThemePicker({
  value,
  skin,
  onChange,
}: {
  value: ThemeId;
  skin?: VoxplySkin | null;
  onChange: (t: ThemeId) => void;
}) {
  return (
    <div className="theme-cards">
      {THEMES.map((t) => (
        <button
          key={t.id}
          className={`theme-card ${value === t.id ? "active" : ""}`}
          onClick={() => onChange(t.id)}
          type="button"
        >
          {t.id === "calm" && <span className="theme-card-default">Default</span>}
          <div className="theme-card-name">{t.name}</div>
          <div className="theme-card-swatches">
            {t.swatches.map((color) => (
              <span
                key={color}
                className="theme-swatch"
                style={{ background: color }}
              />
            ))}
          </div>
          <p className="theme-card-tagline">{t.tagline}</p>
        </button>
      ))}
      <button
        key="custom"
        className={`theme-card ${value === "custom" ? "active" : ""}`}
        onClick={() => onChange("custom")}
        type="button"
      >
        <div className="theme-card-name">Custom</div>
        <div className="theme-card-swatches">
          {skin && Object.keys(skin.tokens).length > 0 ? (
            [skin.tokens["--bg"], skin.tokens["--surface"], skin.tokens["--accent"]]
              .filter(Boolean)
              .map((color, i) => (
                <span key={i} className="theme-swatch" style={{ background: color }} />
              ))
          ) : (
            <span className="theme-swatch" style={{ background: "linear-gradient(135deg, #888 0%, #444 100%)" }} />
          )}
        </div>
        <p className="theme-card-tagline">Your own color overrides.</p>
      </button>
    </div>
  );
}
