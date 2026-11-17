import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ICON_NAMES } from "../themes/iconRegistry";
import { extensionOf, isImagePath, type PackageFiles } from "../themes/packageFormat";
import { MAX_ICON_BYTES, type ThemeManifest } from "../themes/theme";
import { mimeOf } from "../themes/mime";
import type { StoredPackage } from "../themes/packageStore";
import { iconPreview } from "./Icons";

interface Props {
  pkg: StoredPackage<ThemeManifest>;
  onChange: (pkg: StoredPackage<ThemeManifest>) => void;
}

function PackageImage({ bytes, path }: { bytes: Uint8Array; path: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeOf(path) }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [bytes, path]);
  return url ? <img src={url} width={20} height={20} alt="" aria-hidden="true" style={{ objectFit: "contain" }} /> : null;
}

export function ThemeIconsEditor({ pkg, onChange }: Props) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const icons = pkg.manifest.icons ?? {};

  function withIcons(next: Record<string, string>, files: PackageFiles) {
    const used = new Set(Object.values(next));
    const kept = Object.fromEntries(Object.entries(files).filter(([p]) => !p.startsWith("icons/") || used.has(p)));
    const { icons: _drop, ...rest } = pkg.manifest;
    onChange({
      ...pkg,
      manifest: Object.keys(next).length ? { ...rest, icons: next } : rest,
      files: kept,
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !target) return;
    const path = `icons/${target}.${extensionOf(file.name)}`;
    if (!isImagePath(path)) return setError(t("settings.theme.icons.not_image"));
    if (file.size > MAX_ICON_BYTES) return setError(t("settings.theme.icons.too_large"));
    setError(null);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const old = icons[target];
    const files = { ...pkg.files };
    if (old) delete files[old];
    files[path] = bytes;
    withIcons({ ...icons, [target]: path }, files);
  }

  return (
    <div className="settings-section">
      <p className="muted" style={{ fontSize: "var(--text-xs)" }}>{t("settings.theme.icons.hint")}</p>
      <input ref={fileRef} type="file" accept=".png,.webp,.jpg,.jpeg,.svg,image/*" style={{ display: "none" }} onChange={onFile} aria-label={t("settings.theme.icons.pick_aria")} />
      {error && <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--text-xs)" }}>{error}</p>}
      {ICON_NAMES.map((name) => {
        const path = icons[name];
        const bytes = path ? pkg.files[path] : undefined;
        return (
          <div key={name} className="settings-row" style={{ alignItems: "center", gap: 8 }}>
            <span style={{ width: 24, display: "inline-flex", justifyContent: "center" }}>
              {bytes && path ? <PackageImage bytes={bytes} path={path} /> : iconPreview(name, 18)}
            </span>
            <label style={{ flex: 1, fontSize: "var(--text-sm)" }}>{name}</label>
            <button
              className="btn-small"
              onClick={() => {
                setTarget(name);
                fileRef.current?.click();
              }}
            >
              {t("settings.theme.icons.choose")}
            </button>
            {path && (
              <button
                className="btn-small btn-secondary"
                onClick={() => {
                  const next = { ...icons };
                  delete next[name];
                  withIcons(next, pkg.files);
                }}
              >
                {t("settings.theme.icons.clear")}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
