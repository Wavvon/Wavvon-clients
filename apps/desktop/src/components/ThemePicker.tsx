import { THEMES } from "../constants";
import { useTranslation } from "react-i18next";
import type { ThemeId, WavvonSkin } from "@wavvon/ui";

export function ThemePicker({
  value,
  skin,
  onChange,
}: {
  value: ThemeId;
  skin: WavvonSkin | null;
  onChange: (t: ThemeId) => void;
}) {
  // Named `translate` rather than `t`: the map below already binds `t` to the
  // theme, and a shadowed translator type-checks happily while rendering
  // nothing.
  const { t: translate } = useTranslation();
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
        const label = isCustom
          ? (skin?.name ?? translate("settings.theme.custom"))
          : translate(`settings.skin.base.${t.id}`);
        const tagline = isCustom && skin
          ? translate("settings.theme.based_on", { base: skin.base })
          : translate(`settings.theme.tagline.${t.id}`);

        return (
          <button
            key={t.id}
            className={`theme-card ${value === t.id ? "active" : ""}`}
            onClick={() => onChange(t.id)}
            type="button"
          >
            {t.id === "calm" && (
              <span className="theme-card-default">{translate("settings.theme.default_badge")}</span>
            )}
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
