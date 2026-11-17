import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "@wavvon/i18n";
import { loadLangPack } from "../../languages/langPack";
import type { HubLanguagesInfo } from "../../languages/hubLanguages";

/** The hub's language packs and default language (`hub.languages`,
 *  language-packs.md §3). Owner only. */
export interface HubLanguagesActions {
  list: () => Promise<HubLanguagesInfo>;
  /** Stores a package; a pack with the same code is replaced. */
  upload: (bytes: Uint8Array) => Promise<void>;
  remove: (sha256: string) => Promise<void>;
  setDefault: (code: string | null) => Promise<void>;
}

export function HubLanguagesSection({ actions }: { actions: HubLanguagesActions }) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<HubLanguagesInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    actions
      .list()
      .then(setInfo)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [actions]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setInfo(await actions.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void run(async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // The client's own envelope check, so a broken pack is named here.
      loadLangPack(bytes);
      await actions.upload(bytes);
    });
  }

  const codes = [
    ...LANGUAGES.map((l) => ({ code: l.id, label: l.label })),
    ...(info?.packs ?? [])
      .filter((p) => !LANGUAGES.some((l) => l.id === p.code))
      .map((p) => ({ code: p.code, label: p.name })),
  ];

  return (
    <div className="settings-section">
      <h2>{t("hub.admin.languages.title")}</h2>
      <p className="muted">{t("hub.admin.languages.hint")}</p>
      {!info && !error && <p className="muted">{t("hub.admin.languages.loading")}</p>}
      {info && (
        <>
          <label className="settings-label" htmlFor="hub-default-language">{t("hub.admin.languages.default")}</label>
          <select
            id="hub-default-language"
            value={info.default ?? ""}
            disabled={busy}
            onChange={(e) => void run(() => actions.setDefault(e.target.value || null))}
          >
            <option value="">{t("hub.admin.languages.default_none")}</option>
            {codes.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>

          <div className="settings-section">
            {info.packs.length === 0 && <p className="muted">{t("hub.admin.languages.none")}</p>}
            {info.packs.map((p) => (
              <div key={p.sha256} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span>{p.name} <span className="muted">({p.code})</span></span>
                <button className="btn-small btn-secondary danger" disabled={busy} onClick={() => void run(() => actions.remove(p.sha256))}>
                  {t("hub.admin.languages.remove")}
                </button>
              </div>
            ))}
          </div>
          <button className="btn-small" disabled={busy} onClick={() => fileRef.current?.click()}>
            {t("hub.admin.languages.upload")}
          </button>
        </>
      )}
      <input ref={fileRef} type="file" accept=".wavvonlang,application/zip" style={{ display: "none" }} onChange={onFile} aria-label={t("hub.admin.languages.upload")} />
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
