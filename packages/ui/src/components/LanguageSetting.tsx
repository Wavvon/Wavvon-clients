import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { currentLanguageId, languageOptions, resolveLanguage, setLanguage, type LanguageOption } from "@wavvon/i18n";
import { installLangPack, removeLangPack } from "../languages/langPack";
import { SettingRow } from "./SettingRow";

const LANGUAGE_KEY = "wavvon_language";

function choose(id: string) {
  void setLanguage(id);
  try {
    localStorage.setItem(LANGUAGE_KEY, id);
  } catch {
    // private mode: the choice lasts for this page
  }
}

/** The language row of Settings → Appearance, shared by web and desktop:
 *  shipped languages plus installed and hub-offered packs, with coverage. */
export function LanguageSetting(props: { open?: boolean; onToggle?: () => void }) {
  const { t } = useTranslation();
  const [, rerender] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const options = languageOptions();
  const current = currentLanguageId();
  const label = (o: LanguageOption) =>
    o.coverage === undefined
      ? o.label
      : t(o.source === "hub" ? "settings.language.hub_coverage" : "settings.language.coverage", {
          label: o.label,
          percent: Math.round(o.coverage * 100),
        });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const pack = await installLangPack(new Uint8Array(await file.arrayBuffer()));
      setError(null);
      choose(pack.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.language.invalid"));
    }
    rerender((n) => n + 1);
  }

  async function remove(id: string) {
    const wasCurrent = current === id;
    await removeLangPack(id);
    if (wasCurrent) choose(resolveLanguage(null, navigator.language));
    rerender((n) => n + 1);
  }

  const installed = options.filter((o) => o.source === "user");
  return (
    <SettingRow
      title={t("settings.language.label")}
      state={label(options.find((o) => o.id === current) ?? options[0])}
      control={
        <select
          id="settings-language"
          aria-label={t("settings.language.label")}
          value={current}
          onChange={(e) => choose(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>{label(o)}</option>
          ))}
        </select>
      }
      {...props}
    >
      <p className="muted">{t("settings.language.hint")}</p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <label className="settings-label" style={{ marginBottom: 0 }}>{t("settings.language.installed")}</label>
        <button className="btn-small" onClick={() => fileRef.current?.click()}>{t("settings.language.install")}</button>
      </div>
      <input ref={fileRef} type="file" accept=".wavvonlang,application/zip" style={{ display: "none" }} onChange={onFile} aria-label={t("settings.language.install_aria")} />
      {error && <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--text-xs)" }}>{error}</p>}
      {installed.length === 0 ? (
        <p className="muted">{t("settings.language.none")}</p>
      ) : (
        installed.map((o) => (
          <div key={o.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span>{label(o)}</span>
            <button className="btn-small" onClick={() => void remove(o.id)}>{t("settings.language.remove")}</button>
          </div>
        ))
      )}
    </SettingRow>
  );
}
