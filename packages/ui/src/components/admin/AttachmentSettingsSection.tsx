import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AttachmentSettings } from "../../types";
import { ErrorRetry } from "../ErrorRetry";

const MB = 1024 * 1024;

export interface AttachmentSettingsActions {
  getSettings: () => Promise<AttachmentSettings>;
  saveSettings: (patch: Partial<Omit<AttachmentSettings, "attachments_usage">>) => Promise<void>;
}

type Key = Exclude<keyof AttachmentSettings, "attachments_usage">;

const FIELDS: { key: Key; unit: number; min: number; max: number }[] = [
  { key: "max_attachments_per_message", unit: 1, min: 1, max: 25 },
  { key: "attachments_cap_bytes", unit: MB, min: 64, max: 10 * MB },
  { key: "attachments_warn_percent", unit: 1, min: 50, max: 99 },
  { key: "attachments_retention_days", unit: 1, min: 0, max: 3650 },
];

function mb(bytes: number): string {
  return `${(bytes / MB).toFixed(1)} MB`;
}

export function AttachmentSettingsSection({ actions }: { actions: AttachmentSettingsActions }) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AttachmentSettings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoadError(null);
    try {
      const s = await actions.getSettings();
      setSettings(s);
      setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, String(Math.round(s[f.key] / f.unit))])));
    } catch (e) {
      setLoadError(String(e));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!settings) return;
    const patch: Partial<Record<Key, number>> = {};
    for (const f of FIELDS) {
      const next = Number(draft[f.key]) * f.unit;
      if (Number.isFinite(next) && next !== settings[f.key]) patch[f.key] = Math.round(next);
    }
    if (Object.keys(patch).length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await actions.saveSettings(patch);
      await load();
    } catch {
      setError(t("hub.admin.attachment_settings.save_failed"));
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return loadError
      ? <section><ErrorRetry message={loadError} onRetry={load} /></section>
      : <section><p className="muted">{t("hub.admin.attachment_settings.loading")}</p></section>;
  }

  const usage = settings.attachments_usage;
  const labels: Record<Key, string> = {
    max_attachments_per_message: t("hub.admin.attachment_settings.field.max_attachments_per_message"),
    attachments_cap_bytes: t("hub.admin.attachment_settings.field.attachments_cap_bytes"),
    attachments_warn_percent: t("hub.admin.attachment_settings.field.attachments_warn_percent"),
    attachments_retention_days: t("hub.admin.attachment_settings.field.attachments_retention_days"),
  };
  const pct = usage.cap_bytes > 0 ? Math.min(100, Math.round((usage.used_bytes / usage.cap_bytes) * 100)) : 0;

  return (
    <section>
      <h1>{t("hub.admin.attachment_settings.title")}</h1>
      <p className="muted">{t("hub.admin.attachment_settings.hint")}</p>
      <div className="settings-section">
        <label className="settings-label">{t("hub.admin.attachment_settings.usage")}</label>
        <progress value={pct} max={100} aria-label={t("hub.admin.attachment_settings.usage")} />
        <span className="muted"> {mb(usage.used_bytes)} / {mb(usage.cap_bytes)}</span>
      </div>
      {usage.warning && <p className="error-text">{t("hub.admin.attachment_settings.warning")}</p>}
      {usage.evictions > 0 && (
        <p className="muted">{t("hub.admin.attachment_settings.evictions", { count: usage.evictions })}</p>
      )}
      {error && <p className="error-text">{error}</p>}
      {FIELDS.map((f) => (
        <div className="settings-section" key={f.key}>
          <label className="settings-label" htmlFor={`attachment-set-${f.key}`}>
            {labels[f.key]}
          </label>
          <input
            id={`attachment-set-${f.key}`}
            type="number"
            min={f.min}
            max={f.max}
            value={draft[f.key] ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
          />
        </div>
      ))}
      <div className="settings-section">
        <button onClick={() => void save()} disabled={saving}>{t("hub.admin.attachment_settings.save")}</button>
      </div>
    </section>
  );
}
