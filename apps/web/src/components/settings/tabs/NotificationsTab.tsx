import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Hub, NotifLevel } from "@shared/types";
import { getNotifPref, setNotifPref } from "@platform";

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
    try { return localStorage.getItem("wavvon.voiceSounds") !== "0"; } catch { return true; }
  });
  function toggleVoiceSounds(on: boolean) {
    setVoiceSounds(on);
    try { localStorage.setItem("wavvon.voiceSounds", on ? "1" : "0"); } catch { /* ignore */ }
  }
  const [hubNotifPrefs, setHubNotifPrefs] = useState<Record<string, NotifLevel>>(() => {
    const prefs: Record<string, NotifLevel> = {};
    for (const hub of props.hubs) {
      prefs[hub.hub_url] = getNotifPref(hub.hub_url);
    }
    return prefs;
  });

  return (
    <section>
      <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.notifications")}</h1>
      <div className="settings-section" style={{ marginBottom: 20 }}>
        <label className="settings-label">{t("settings.notifications.mention.label")}</label>
        <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
          {t("settings.notifications.mention.hint")}
        </p>
        <label className="checkbox-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={props.mentionPingEnabled ?? true}
            onChange={(e) => props.onMentionPingChange?.(e.target.checked)}
          />
          {t("settings.notifications.mention.enable")}
        </label>
      </div>
      <div className="settings-section" style={{ marginBottom: 20 }}>
        <label className="settings-label">Voice sounds</label>
        <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
          Play a short tone when you or someone else joins or leaves your voice channel.
        </p>
        <label className="checkbox-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={voiceSounds}
            onChange={(e) => toggleVoiceSounds(e.target.checked)}
          />
          Play voice join/leave sounds
        </label>
      </div>
      <div className="settings-section" style={{ marginBottom: 20 }}>
        <label className="settings-label">{t("settings.notifications.desktop.label")}</label>
        <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
          {t("settings.notifications.desktop.hint")}
        </p>
        <button
          className="btn-secondary"
          onClick={() => {
            if (typeof Notification !== "undefined") {
              Notification.requestPermission().catch(() => {});
            }
          }}
        >
          {t("settings.notifications.desktop.request")}
        </button>
        {typeof Notification !== "undefined" && (
          <p className="muted" style={{ marginTop: 8, fontSize: "var(--text-sm)" }}>
            {t("settings.notifications.desktop.permission", { value: Notification.permission })}
          </p>
        )}
      </div>
      {props.hubs.length > 0 && (
        <div className="settings-section">
          <label className="settings-label">{t("settings.notifications.per_hub.label")}</label>
          <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 12 }}>
            {t("settings.notifications.per_hub.hint")}
          </p>
          {props.hubs.map((hub) => (
            <div
              key={hub.hub_id}
              className="settings-row"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}
            >
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{hub.hub_name}</span>
              <div style={{ display: "flex", gap: 4 }}>
                {NOTIF_LEVELS.map((level) => (
                  <button
                    key={level.value}
                    className={hubNotifPrefs[hub.hub_url] === level.value ? "btn-primary" : "btn-secondary"}
                    style={{ fontSize: "var(--text-xs)", padding: "3px 8px" }}
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
        </div>
      )}
    </section>
  );
}
