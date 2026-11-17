import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, setLanguage } from "@wavvon/i18n";
import type { ThemesController } from "@wavvon/ui";
import { SettingRow, ThemesGallery, ThemesSection } from "@wavvon/ui";
import { fetchWithTimeout } from "@platform";
import { DISCOVERY_URL } from "../../../constants";

interface Props {
  themes: ThemesController;
}

export function AppearanceTab(props: Props) {
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.language ?? "en").slice(0, 2);
  function changeLanguage(lng: string) {
    void setLanguage(lng);
    try { localStorage.setItem("wavvon_language", lng); } catch { /* ignore */ }
  }
  const [open, setOpen] = useState<string | null>(null);
  const row = (id: string) => ({
    open: open === id,
    onToggle: () => setOpen((cur) => (cur === id ? null : id)),
  });

  const themeState = props.themes.active?.manifest.name ?? t("settings.theme.builtin");

  return (
    <section>
      <h1>{t("settings.tabs.appearance")}</h1>

      <SettingRow
        title={t("settings.language.label")}
        state={LANGUAGES.find((l) => l.id === currentLang)?.label ?? currentLang}
        control={
          <select
            id="settings-language"
            aria-label={t("settings.language.label")}
            value={currentLang}
            onChange={(e) => changeLanguage(e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        }
        {...row("language")}
      />

      <SettingRow title={t("settings.theme.label")} state={themeState} {...row("theme")}>
        <p className="muted">{t("settings.theme.hint")}</p>
        <ThemesSection controller={props.themes} />
      </SettingRow>

      {/* Not a row: the gallery renders nothing when the directory is
          unreachable, and a row that opens onto nothing is worse than none. */}
      {DISCOVERY_URL && (
        <ThemesGallery controller={props.themes} fetchWithTimeout={fetchWithTimeout} discoveryUrl={DISCOVERY_URL} />
      )}
    </section>
  );
}
