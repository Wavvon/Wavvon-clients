import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ThemesController } from "@wavvon/ui";
import { LanguageSetting, SettingRow, ThemesGallery, ThemesSection } from "@wavvon/ui";
import { fetchWithTimeout } from "@platform";
import { DISCOVERY_URL } from "../../../constants";

interface Props {
  themes: ThemesController;
}

export function AppearanceTab(props: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  const row = (id: string) => ({
    open: open === id,
    onToggle: () => setOpen((cur) => (cur === id ? null : id)),
  });

  const themeState = props.themes.active?.manifest.name ?? t("settings.theme.builtin");

  return (
    <section>
      <h1>{t("settings.tabs.appearance")}</h1>

      <LanguageSetting {...row("language")} />

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
