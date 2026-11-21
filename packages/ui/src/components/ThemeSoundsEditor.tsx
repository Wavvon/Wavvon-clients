import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { playSoundBytes, SOUND_NAMES } from "@wavvon/core";
import { extensionOf, type PackageFiles } from "../themes/packageFormat";
import type { StoredPackage } from "../themes/packageStore";
import { soundProblem, type ThemeManifest } from "../themes/theme";

interface Props {
  pkg: StoredPackage<ThemeManifest>;
  onChange: (pkg: StoredPackage<ThemeManifest>) => void;
}

export function ThemeSoundsEditor({ pkg, onChange }: Props) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sounds = pkg.manifest.sounds ?? {};

  function withSounds(next: Record<string, string>, files: PackageFiles) {
    const used = new Set(Object.values(next));
    const kept = Object.fromEntries(Object.entries(files).filter(([p]) => !p.startsWith("sounds/") || used.has(p)));
    const { sounds: _drop, ...rest } = pkg.manifest;
    onChange({ ...pkg, manifest: Object.keys(next).length ? { ...rest, sounds: next } : rest, files: kept });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !target) return;
    const path = `sounds/${target}.${extensionOf(file.name)}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > 256 * 1024) return setError(t("settings.theme.sounds.too_large"));
    if (soundProblem(target, path, bytes)) return setError(t("settings.theme.sounds.unusable"));
    setError(null);
    const old = sounds[target];
    const files = { ...pkg.files };
    if (old) delete files[old];
    files[path] = bytes;
    withSounds({ ...sounds, [target]: path }, files);
  }

  return (
    <div className="settings-section">
      <p className="muted" style={{ fontSize: "var(--text-xs)" }}>{t("settings.theme.sounds.hint")}</p>
      <input ref={fileRef} type="file" accept=".ogg,.mp3,.wav,audio/*" style={{ display: "none" }} onChange={onFile} aria-label={t("settings.theme.sounds.pick_aria")} />
      {error && <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--text-xs)" }}>{error}</p>}
      {SOUND_NAMES.map((name) => {
        const path = sounds[name];
        const bytes = path ? pkg.files[path] : undefined;
        return (
          <div key={name} className="settings-row" style={{ alignItems: "center", gap: 8 }}>
            <label style={{ flex: 1, fontSize: "var(--text-sm)" }}>{t(`settings.theme.sounds.name.${name}`)}</label>
            {bytes && <button className="btn-small btn-secondary" onClick={() => playSoundBytes(bytes)}>{t("settings.theme.sounds.play")}</button>}
            <button
              className="btn-small"
              onClick={() => {
                setTarget(name);
                fileRef.current?.click();
              }}
            >
              {t("settings.theme.sounds.choose")}
            </button>
            {path && (
              <button
                className="btn-small btn-secondary"
                onClick={() => {
                  const next = { ...sounds };
                  delete next[name];
                  withSounds(next, pkg.files);
                }}
              >
                {t("settings.theme.sounds.clear")}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
