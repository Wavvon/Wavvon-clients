import { useState } from "react";
import { useTranslation } from "react-i18next";
import { contrastWarnings } from "../themes/contrast";
import { readBaseToken, type Scheme, type ThemeManifest } from "../themes/theme";
import type { StoredPackage } from "../themes/packageStore";
import { composeRgba, splitRgba, THEME_TOKENS, type ThemeTokenType } from "../themes/themeTokens";
import { ResetIcon } from "./Icons";
import { ThemeBackgroundEditor } from "./ThemeBackgroundEditor";
import { ThemeIconsEditor } from "./ThemeIconsEditor";
import { ThemeLayoutEditor } from "./ThemeLayoutEditor";

interface Props {
  pkg: StoredPackage<ThemeManifest>;
  onChange: (pkg: StoredPackage<ThemeManifest>) => void;
}

const SCHEMES: Scheme[] = ["dark", "light"];

function TokenRow({
  type,
  label,
  value,
  fallback,
  onChange,
  onReset,
}: {
  type: ThemeTokenType;
  label: string;
  value: string | undefined;
  fallback: string;
  onChange: (v: string) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const effective = value ?? fallback;
  const reset = value !== undefined && (
    <button
      className="btn-icon"
      onClick={onReset}
      title={t("settings.theme.reset_token")}
      aria-label={t("settings.theme.reset_token_aria", { label })}
      style={{ marginLeft: 4 }}
    >
      <ResetIcon size={13} />
    </button>
  );

  let control;
  if (type === "radius") {
    const n = parseFloat(effective) || 1;
    control = (
      <>
        <input type="range" min="0.5" max="2" step="0.05" value={n} onChange={(e) => onChange(e.target.value)} style={{ width: 120 }} aria-label={label} />
        <span style={{ width: 36, textAlign: "right", fontSize: "var(--text-xs)" }}>{n.toFixed(2)}×</span>
      </>
    );
  } else if (type === "shadow") {
    control = (
      <input type="text" value={effective} onChange={(e) => onChange(e.target.value)} style={{ width: 200, fontSize: "var(--text-xs)", fontFamily: "monospace" }} aria-label={label} />
    );
  } else if (type === "color-alpha") {
    const { hex, alpha } = splitRgba(effective);
    control = (
      <>
        <input type="color" value={hex.slice(0, 7)} onChange={(e) => onChange(composeRgba(e.target.value, alpha))} style={{ width: 36, height: 24, padding: 2, cursor: "pointer" }} aria-label={`${label} color`} />
        <input type="range" min="0" max="1" step="0.01" value={alpha} onChange={(e) => onChange(composeRgba(hex, parseFloat(e.target.value)))} style={{ width: 80, marginLeft: 4 }} aria-label={`${label} opacity`} />
        <span style={{ width: 32, fontSize: "var(--text-xs)", textAlign: "right" }}>{Math.round(alpha * 100)}%</span>
      </>
    );
  } else {
    control = (
      <>
        <input type="color" value={effective.startsWith("#") ? effective.slice(0, 7) : "#000000"} onChange={(e) => onChange(e.target.value)} style={{ width: 36, height: 24, padding: 2, cursor: "pointer" }} aria-label={label} />
        <input type="text" value={effective} onChange={(e) => onChange(e.target.value)} style={{ width: 100, marginLeft: 6, fontSize: "var(--text-xs)", fontFamily: "monospace" }} aria-label={`${label} hex`} />
      </>
    );
  }
  return (
    <div className="settings-row" style={{ alignItems: "center" }}>
      <label style={{ flex: 1, fontSize: "var(--text-sm)" }}>{label}</label>
      {control}
      {reset}
    </div>
  );
}

export function ThemeEditor({ pkg, onChange }: Props) {
  const { t } = useTranslation();
  const present = SCHEMES.filter((s) => pkg.manifest.colors[s]);
  const [tab, setTab] = useState<"colors" | "icons" | "background" | "layout">("colors");
  const [picked, setPicked] = useState<Scheme>(present[0] ?? "dark");
  const scheme = present.includes(picked) ? picked : (present[0] ?? "dark");
  const map = pkg.manifest.colors[scheme] ?? {};
  const other = SCHEMES.find((s) => s !== scheme)!;

  function setColors(s: Scheme, tokens: Record<string, string>) {
    onChange({ ...pkg, manifest: { ...pkg.manifest, colors: { ...pkg.manifest.colors, [s]: tokens } } });
  }

  const warnings = contrastWarnings((tok) => map[tok] ?? readBaseToken(tok, scheme));

  return (
    <div style={{ marginTop: 16 }}>
      <div className="settings-section">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <label className="settings-label" style={{ marginBottom: 0 }}>{t("settings.theme.name")}</label>
          <input
            type="text"
            value={pkg.manifest.name}
            onChange={(e) => onChange({ ...pkg, manifest: { ...pkg.manifest, name: e.target.value.slice(0, 48) } })}
            maxLength={48}
            style={{ flex: 1 }}
            aria-label={t("settings.theme.name")}
          />
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }} role="tablist">
          {(["colors", "icons", "background", "layout"] as const).map((id) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`btn-small${tab === id ? "" : " btn-secondary"}`} onClick={() => setTab(id)}>
              {t(`settings.theme.tab.${id}`)}
            </button>
          ))}
        </div>
        {tab === "colors" && <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {present.length > 1 ? (
            <select value={scheme} onChange={(e) => setPicked(e.target.value as Scheme)} aria-label={t("settings.theme.editing_scheme")}>
              {present.map((s) => <option key={s} value={s}>{t(`settings.theme.scheme.${s}`)}</option>)}
            </select>
          ) : (
            <button
              className="btn-secondary"
              onClick={() => {
                setColors(other, {});
                setPicked(other);
              }}
            >
              {t(`settings.theme.add_scheme.${other}`)}
            </button>
          )}
          {Object.keys(map).length > 0 && (
            <button className="btn-secondary" onClick={() => setColors(scheme, {})}>
              {t("settings.theme.reset_all", { count: Object.keys(map).length })}
            </button>
          )}
        </div>}
        {tab === "colors" && warnings.length > 0 && (
          <div role="status" style={{ color: "var(--warning)", fontSize: "var(--text-xs)" }}>
            <p style={{ margin: "0 0 4px" }}>{t("settings.theme.contrast_warning")}</p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {warnings.map((w) => (
                <li key={`${w.text}${w.surface}`}>
                  {t("settings.theme.contrast_pair", { text: w.text, surface: w.surface, ratio: w.ratio.toFixed(1) })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {tab === "icons" && <ThemeIconsEditor pkg={pkg} onChange={onChange} />}
      {tab === "layout" && <ThemeLayoutEditor pkg={pkg} onChange={onChange} />}
      {tab === "background" && <ThemeBackgroundEditor pkg={pkg} onChange={onChange} />}
      {tab === "colors" && THEME_TOKENS.map((group) => (
        <div key={group.group} className="settings-section">
          <label className="settings-label">{group.group}</label>
          {group.tokens.map((tok) => (
            <TokenRow
              key={`${scheme}${tok.name}`}
              type={tok.type}
              label={tok.label}
              value={map[tok.name]}
              fallback={readBaseToken(tok.name, scheme)}
              onChange={(v) => setColors(scheme, { ...map, [tok.name]: v })}
              onReset={() => {
                const next = { ...map };
                delete next[tok.name];
                setColors(scheme, next);
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
