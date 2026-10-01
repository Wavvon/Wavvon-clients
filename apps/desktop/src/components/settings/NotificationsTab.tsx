import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingRow } from "@wavvon/ui";

interface Props {
  mentionPingEnabled: boolean;
  onMentionPingChange: (v: boolean) => void;
}

// Mention ping + notify sound together (settings-ia.md §4b) — moved out of
// the Voice tab. Desktop only ever had one such toggle (labeled "notify
// sound" in Voice but backed by the same mention-ping state web exposes
// separately); there's no second, distinct desktop setting to carry over.
export function NotificationsTab({ mentionPingEnabled, onMentionPingChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <section>
      <h1>{t("settings.tabs.notifications")}</h1>
      <SettingRow
        title={t("settings.notifications.mention.label")}
        state={mentionPingEnabled ? t("settings.state.on") : t("settings.state.off")}
        control={
          <input
            type="checkbox"
            checked={mentionPingEnabled}
            aria-label={t("settings.notifications.mention.enable")}
            onChange={(e) => onMentionPingChange(e.target.checked)}
          />
        }
        open={open}
        onToggle={() => setOpen((v) => !v)}
      />
    </section>
  );
}
