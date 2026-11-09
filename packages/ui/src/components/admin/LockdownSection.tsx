import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingRow } from "../SettingRow";

/** The hub's raid response settings (`/admin/settings/lockdown`). */
export interface LockdownSettings {
  enabled: boolean;
  freeze_minutes: number;
  raid_join_threshold: number;
  auto_lockdown: boolean;
}

export interface LockdownActions {
  getLockdown: () => Promise<LockdownSettings>;
  putLockdown: (settings: LockdownSettings) => Promise<LockdownSettings>;
}

/** One switch for a raid under way: no new members while it is on, recent
 *  joiners optionally held back, and a join-rate alert that can throw it. */
export function LockdownSection({ actions }: { actions: LockdownActions }) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<LockdownSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    actions.getLockdown().then(setSettings).catch((e) => setError(String(e instanceof Error ? e.message : e)));
  }, [actions]);

  async function save(next: LockdownSettings) {
    setSaving(true);
    setError(null);
    try {
      setSettings(await actions.putLockdown(next));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return error ? <p className="error-text">{error}</p> : null;
  const number = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

  return (
    <div className="settings-section">
      <h2>{t("hub.admin.lockdown.title")}</h2>
      <p className="muted">{t("hub.admin.lockdown.hint")}</p>
      <SettingRow
        title={t("hub.admin.lockdown.enabled")}
        state={settings.enabled ? t("hub.admin.lockdown.on_hint") : t("hub.admin.lockdown.off_hint")}
        control={
        <button
          className={settings.enabled ? "btn-danger" : "btn-primary"}
          disabled={saving}
          onClick={() => save({ ...settings, enabled: !settings.enabled })}
        >
          {settings.enabled ? t("hub.admin.lockdown.lift") : t("hub.admin.lockdown.engage")}
        </button>
        }
      />
      <SettingRow
        title={t("hub.admin.lockdown.freeze")}
        state={t("hub.admin.lockdown.freeze_hint")}
        control={
        <input
          type="number"
          min={0}
          max={1440}
          value={settings.freeze_minutes}
          disabled={saving}
          onChange={(e) => setSettings({ ...settings, freeze_minutes: number(e.target.value) })}
          onBlur={() => save(settings)}
          style={{ width: 90 }}
        />
        }
      />
      <SettingRow
        title={t("hub.admin.lockdown.threshold")}
        state={t("hub.admin.lockdown.threshold_hint")}
        control={
        <input
          type="number"
          min={0}
          max={10000}
          value={settings.raid_join_threshold}
          disabled={saving}
          onChange={(e) => setSettings({ ...settings, raid_join_threshold: number(e.target.value) })}
          onBlur={() => save(settings)}
          style={{ width: 90 }}
        />
        }
      />
      <SettingRow
        title={t("hub.admin.lockdown.auto")}
        state={t("hub.admin.lockdown.auto_hint")}
        control={
        <input
          type="checkbox"
          checked={settings.auto_lockdown}
          disabled={saving}
          onChange={(e) => save({ ...settings, auto_lockdown: e.target.checked })}
        />
        }
      />
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
