import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ThemeId, WavvonSkin } from "@wavvon/ui";
import { SettingRow, SkinEditor, SkinsGallery } from "@wavvon/ui";
import { DISCOVERY_URL } from "../../../constants";
import type { NamedCustomTheme } from "@shared/utils/customThemes";
import { fetchWithTimeout } from "@platform";
import { CustomThemesSection } from "../CustomThemesSection";

// The four base names reuse the skin editor's keys; "custom" is this picker's
// own. The names themselves are not translated — Calm is called Calm.
const THEMES: ThemeId[] = ["dark", "light", "custom"];

const LANGUAGES: { id: string; label: string }[] = [
  { id: "en", label: "English" },
  { id: "it", label: "Italiano" },
  { id: "es", label: "Español" },
  { id: "de", label: "Deutsch" },
];

interface Props {
  theme: ThemeId;
  onThemeChange: (t: ThemeId) => void;
  skin: WavvonSkin | null;
  onSkinChange: (skin: WavvonSkin) => void;
  customThemes: NamedCustomTheme[];
  activeCustomThemeId: string | null;
  onApplyCustomTheme: (id: string) => void;
  onNewCustomTheme: () => void;
  onRenameCustomTheme: (id: string, name: string) => void;
  onDuplicateCustomTheme: (id: string) => void;
  onDeleteCustomTheme: (id: string) => void;
  onImportSkin: (skin: WavvonSkin) => void;
}

export function AppearanceTab(props: Props) {
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.language ?? "en").slice(0, 2);
  function changeLanguage(lng: string) {
    void i18n.changeLanguage(lng);
    try { localStorage.setItem("wavvon_language", lng); } catch { /* ignore */ }
  }
  const [open, setOpen] = useState<string | null>(null);
  const row = (id: string) => ({
    open: open === id,
    onToggle: () => setOpen((cur) => (cur === id ? null : id)),
  });

  const activeCustom = props.customThemes.find((c) => c.id === props.activeCustomThemeId);
  const themeState = props.theme === "custom"
    ? activeCustom?.name ?? t("settings.theme.custom")
    : t(`settings.skin.base.${props.theme}`);

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

      <SettingRow
        title={t("settings.theme.label")}
        state={themeState}
        {...row("theme")}
      >
        <p className="muted">{t("settings.theme.hint")}</p>
        <div className="theme-picker">
          {THEMES.map((theme) => (
            <button
              key={theme}
              className={`theme-choice${props.theme === theme ? " active" : ""}`}
              onClick={() => props.onThemeChange(theme)}
            >
              {theme === "custom" ? t("settings.theme.custom") : t(`settings.skin.base.${theme}`)}
            </button>
          ))}
        </div>
        {props.theme === "custom" && (
          <>
            <CustomThemesSection
              themes={props.customThemes}
              activeId={props.activeCustomThemeId}
              onApply={props.onApplyCustomTheme}
              onNew={props.onNewCustomTheme}
              onRename={props.onRenameCustomTheme}
              onDuplicate={props.onDuplicateCustomTheme}
              onDelete={props.onDeleteCustomTheme}
            />
            {props.skin && <SkinEditor skin={props.skin} onChange={props.onSkinChange} />}
          </>
        )}
      </SettingRow>

      {/* Not a row: the gallery renders nothing when discovery is
          unreachable, and a row that opens onto nothing is worse than no
          row at all. */}
      {DISCOVERY_URL && (
        <SkinsGallery
          fetchWithTimeout={fetchWithTimeout}
          onImport={props.onImportSkin}
          discoveryUrl={DISCOVERY_URL}
        />
      )}
    </section>
  );
}
