import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BG_FITS, DEFAULT_BACKGROUND, type BackgroundFit } from "../themes/background";
import { extensionOf, isImagePath } from "../themes/packageFormat";
import type { StoredPackage } from "../themes/packageStore";
import { MAX_BACKGROUND_BYTES, type ThemeBackground, type ThemeManifest } from "../themes/theme";
import { useBlobUrl } from "../themes/useBlobUrl";

interface Props {
  pkg: StoredPackage<ThemeManifest>;
  onChange: (pkg: StoredPackage<ThemeManifest>) => void;
}

function Slider({ label, min, max, step, value, onChange }: {
  label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="settings-row" style={{ alignItems: "center" }}>
      <label style={{ flex: 1, fontSize: "var(--text-sm)" }}>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ width: 140 }} aria-label={label} />
      <span style={{ width: 40, textAlign: "right", fontSize: "var(--text-xs)" }}>{value}</span>
    </div>
  );
}

export function ThemeBackgroundEditor({ pkg, onChange }: Props) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bg = pkg.manifest.background;
  const url = useBlobUrl(bg ? pkg.files[bg.image] : undefined, bg?.image);

  function setBg(next: ThemeBackground | undefined, files = pkg.files) {
    const { background: _drop, ...rest } = pkg.manifest;
    onChange({ ...pkg, manifest: next ? { ...rest, background: next } : rest, files });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const path = `background.${extensionOf(file.name)}`;
    if (!isImagePath(path)) return setError(t("settings.theme.background.not_image"));
    if (file.size > MAX_BACKGROUND_BYTES) return setError(t("settings.theme.background.too_large"));
    setError(null);
    const files = { ...pkg.files };
    if (bg) delete files[bg.image];
    files[path] = new Uint8Array(await file.arrayBuffer());
    setBg({ ...(bg ?? { ...DEFAULT_BACKGROUND }), image: path }, files);
  }

  return (
    <div className="settings-section">
      <p className="muted" style={{ fontSize: "var(--text-xs)" }}>{t("settings.theme.background.hint")}</p>
      <input ref={fileRef} type="file" accept=".png,.webp,.jpg,.jpeg,.svg,image/*" style={{ display: "none" }} onChange={onFile} aria-label={t("settings.theme.background.pick_aria")} />
      {error && <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--text-xs)" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        {url && <img src={url} alt="" aria-hidden="true" width={96} height={54} style={{ objectFit: "cover", borderRadius: "var(--r-sm)" }} />}
        <button className="btn-small" onClick={() => fileRef.current?.click()}>{t("settings.theme.background.choose")}</button>
        {bg && (
          <button
            className="btn-small btn-secondary"
            onClick={() => {
              const files = { ...pkg.files };
              delete files[bg.image];
              setBg(undefined, files);
            }}
          >
            {t("settings.theme.background.clear")}
          </button>
        )}
      </div>
      {bg && (
        <>
          <div className="settings-row" style={{ alignItems: "center" }}>
            <label style={{ flex: 1, fontSize: "var(--text-sm)" }} htmlFor="theme-bg-fit">{t("settings.theme.background.fit")}</label>
            <select id="theme-bg-fit" value={bg.fit} onChange={(e) => setBg({ ...bg, fit: e.target.value as BackgroundFit })}>
              {BG_FITS.map((f) => <option key={f} value={f}>{t(`settings.theme.background.fit.${f}`)}</option>)}
            </select>
          </div>
          <Slider label={t("settings.theme.background.dim")} min={0} max={0.9} step={0.05} value={bg.dim} onChange={(dim) => setBg({ ...bg, dim })} />
          <Slider label={t("settings.theme.background.panel_opacity")} min={0.6} max={1} step={0.02} value={bg.panel_opacity} onChange={(panel_opacity) => setBg({ ...bg, panel_opacity })} />
          <Slider label={t("settings.theme.background.blur")} min={0} max={20} step={1} value={bg.blur} onChange={(blur) => setBg({ ...bg, blur })} />
        </>
      )}
    </div>
  );
}
