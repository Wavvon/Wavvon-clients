import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Hub, NotifLevel } from "@shared/types";
import { SettingRow } from "@wavvon/ui";
import { getNotifPref, setNotifPref } from "@platform";
import { getScoped, setScoped } from "@shared/utils/accountScope";

interface Props {
  hubs: Hub[];
  mentionPingEnabled?: boolean;
  onMentionPingChange?: (v: boolean) => void;
}

export function NotificationsTab(props: Props) {
  const { t } = useTranslation();
  const NOTIF_LEVELS: { value: NotifLevel; label: string }[] = [
    { value: "all", label: t("settings.notifications.level.all") },
    { value: "mentions", label: t("settings.notifications.level.mentions") },
    { value: "none", label: t("settings.notifications.level.none") },
  ];
  const [voiceSounds, setVoiceSounds] = useState(() => {
    try { return getScoped("wavvon.voiceSounds") !== "0"; } catch { return true; }
  });
  function toggleVoiceSounds(on: boolean) {
    setVoiceSounds(on);
    try { setScoped("wavvon.voiceSounds", on ? "1" : "0"); } catch { /* ignore */ }
  }
  const [hubNotifPrefs, setHubNotifPrefs] = useState<Record<string, NotifLevel>>(() => {
    const prefs: Record<string, NotifLevel> = {};
    for (const hub of props.hubs) {
      prefs[hub.hub_url] = getNotifPref(hub.hub_url);
    }
    return prefs;
  });
  const [open, setOpen] = useState<string | null>(null);
  const row = (id: string) => ({
    open: open === id,
    onToggle: () => setOpen((cur) => (cur === id ? null : id)),
  });

  const mentionOn = props.mentionPingEnabled ?? true;
  const permission = typeof Notification !== "undefined" ? Notification.permission : null;

  return (
    <section>
      <h1>{t("settings.tabs.notifications")}</h1>

      <SettingRow
        title={t("settings.notifications.mention.label")}
        state={mentionOn ? t("settings.state.on") : t("settings.state.off")}
        control={
          <input
            type="checkbox"
            checked={mentionOn}
            aria-label={t("settings.notifications.mention.enable")}
            onChange={(e) => props.onMentionPingChange?.(e.target.checked)}
          />
        }
        {...row("mention")}
      />

      <SettingRow
        title={t("settings.notifications.voice_sounds.label")}
        state={voiceSounds ? t("settings.state.on") : t("settings.state.off")}
        control={
          <input
            type="checkbox"
            checked={voiceSounds}
            aria-label={t("settings.notifications.voice_sounds.enable")}
            onChange={(e) => toggleVoiceSounds(e.target.checked)}
          />
        }
        {...row("voice-sounds")}
      />

      <SettingRow
        title={t("settings.notifications.desktop.label")}
        state={permission
          ? t(`settings.notifications.desktop.state.${permission}`)
          : t("settings.notifications.desktop.state.unsupported")}
        {...row("desktop")}
      >
        <p className="muted">{t("settings.notifications.desktop.hint")}</p>
        <button
          className="btn-small"
          disabled={permission !== "default"}
          onClick={() => {
            if (typeof Notification !== "undefined") {
              Notification.requestPermission().catch(() => {});
            }
          }}
        >
          {t("settings.notifications.desktop.request")}
        </button>
      </SettingRow>

      {props.hubs.length > 0 && (
        <SettingRow
          title={t("settings.notifications.per_hub.label")}
          state={t("settings.notifications.per_hub.state", { count: props.hubs.length })}
          {...row("per-hub")}
        >
          <p className="muted">{t("settings.notifications.per_hub.hint")}</p>
          {props.hubs.map((hub) => (
            <div
              key={hub.hub_id}
              className="settings-row"
              style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}
            >
              <span>{hub.hub_name}</span>
              <div style={{ display: "flex", gap: 4 }}>
                {NOTIF_LEVELS.map((level) => (
                  <button
                    key={level.value}
                    className={`btn-small${hubNotifPrefs[hub.hub_url] === level.value ? " btn-primary" : ""}`}
                    onClick={() => {
                      setNotifPref(hub.hub_url, level.value);
                      setHubNotifPrefs((prev) => ({ ...prev, [hub.hub_url]: level.value }));
                    }}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </SettingRow>
      )}
    </section>
  );
}
