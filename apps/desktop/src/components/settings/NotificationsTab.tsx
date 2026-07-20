import { useTranslation } from "react-i18next";

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
  return (
    <section>
      <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.notifications")}</h1>
      <div className="settings-section">
        <label className="settings-label">{t("settings.notifications.mention.label")}</label>
        <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
          {t("settings.notifications.mention.hint")}
        </p>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={mentionPingEnabled}
            onChange={(e) => onMentionPingChange(e.target.checked)}
          />
          {t("settings.notifications.mention.enable")}
        </label>
      </div>
    </section>
  );
}
