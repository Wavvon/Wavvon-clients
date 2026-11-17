import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadTheme, type ThemePackage } from "../../themes/theme";
import { useBlobUrl } from "../../themes/useBlobUrl";

/** The hub default theme (`hub.theme`, themes.md §4). */
export interface HubThemeActions {
  /** The current package, or null when the hub has none. */
  fetchCurrent: () => Promise<Uint8Array | null>;
  /** Stores a package; the hub validates it again and refuses what the client would. */
  upload: (bytes: Uint8Array) => Promise<void>;
  remove: () => Promise<void>;
}

const SWATCH_TOKENS = ["--bg", "--surface", "--accent"];

export function HubThemeSection({ actions }: { actions: HubThemeActions }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState<ThemePackage | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    actions
      .fetchCurrent()
      .then((bytes) => setCurrent(bytes ? loadTheme(bytes) : null))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [actions]);

  const previewPath = current?.manifest.preview;
  const previewUrl = useBlobUrl(previewPath ? current?.files[previewPath] : undefined, previewPath);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // The same check the hub runs, so a broken package is named here.
      const pkg = loadTheme(bytes);
      await actions.upload(bytes);
      setCurrent(pkg);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.theme.invalid"));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    setError(null);
    try {
      await actions.remove();
      setCurrent(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const colors = current?.manifest.colors.dark ?? current?.manifest.colors.light ?? {};

  return (
    <div className="settings-section">
      <h2>{t("hub.admin.theme.title")}</h2>
      <p className="muted">{t("hub.admin.theme.hint")}</p>
      {current === undefined && !error && <p className="muted">{t("hub.admin.theme.loading")}</p>}
      {current === null && <p className="muted">{t("hub.admin.theme.none")}</p>}
      {current && (
        <div className="settings-section">
          <strong>{current.manifest.name}</strong>
          {current.manifest.description && <p className="muted">{current.manifest.description}</p>}
          {previewUrl ? (
            <img src={previewUrl} alt={t("hub.admin.theme.preview_alt")} style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid var(--border)" }} />
          ) : (
            <div style={{ display: "flex", gap: 4 }} aria-hidden="true">
              {SWATCH_TOKENS.map((tok) => (
                <span key={tok} style={{ width: 24, height: 24, borderRadius: 4, border: "1px solid var(--border)", background: colors[tok] ?? `var(${tok})` }} />
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn-small" disabled={busy || current === undefined} onClick={() => fileRef.current?.click()}>
          {current ? t("hub.admin.theme.replace") : t("hub.admin.theme.upload")}
        </button>
        {current && (
          <button className="btn-small btn-secondary danger" disabled={busy} onClick={() => void onRemove()}>
            {t("hub.admin.theme.remove")}
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept=".wavvontheme,application/zip" style={{ display: "none" }} onChange={onFile} aria-label={t("hub.admin.theme.upload")} />
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
