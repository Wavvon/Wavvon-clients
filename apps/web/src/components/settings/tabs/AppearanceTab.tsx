import { useTranslation } from "react-i18next";
import type { ThemeId, WavvonSkin } from "@wavvon/ui";
import { SkinEditor, SkinsGallery } from "@wavvon/ui";
import { DISCOVERY_URL } from "../../../constants";
import type { NamedCustomTheme } from "@shared/utils/customThemes";
import { fetchWithTimeout } from "@platform";
import { CustomThemesSection } from "../CustomThemesSection";

// The four base names reuse the skin editor's keys; "custom" is this picker's
// own. The names themselves are not translated — Calm is called Calm.
const THEMES: ThemeId[] = ["calm", "classic", "linear", "light", "custom"];

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

  return (
    <section>
      <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.appearance")}</h1>
      <div className="settings-section">
        <label className="settings-label" htmlFor="settings-language">{t("settings.language.label")}</label>
        <select
          id="settings-language"
          value={currentLang}
          onChange={(e) => changeLanguage(e.target.value)}
          style={{ width: "100%", maxWidth: 320 }}
        >
          <option value="en">English</option>
          <option value="it">Italiano</option>
          <option value="es">Español</option>
          <option value="de">Deutsch</option>
        </select>
      </div>
      <div className="settings-section">
        <label className="settings-label">{t("settings.theme.label")}</label>
        <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 12 }}>
          {t("settings.theme.hint")}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {THEMES.map((theme) => (
            <button
              key={theme}
              onClick={() => props.onThemeChange(theme)}
              style={{
                padding: "8px 16px",
                borderRadius: "var(--r-sm)",
                border: props.theme === theme ? "2px solid var(--accent)" : "1px solid var(--border)",
                background: props.theme === theme ? "var(--accent-subtle, var(--surface))" : "var(--surface)",
                // Without an explicit color these inherit the base button's
                // var(--accent-text), which is dark in calm and white in
                // light — i.e. unreadable on a surface background.
                color: "var(--text)",
                cursor: "pointer",
                fontWeight: props.theme === theme ? 600 : 400,
              }}
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
      </div>
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
