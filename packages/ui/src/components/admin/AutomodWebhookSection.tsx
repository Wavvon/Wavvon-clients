import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModerationSettings } from "../../types";
import { SettingRow } from "../SettingRow";

export interface AutomodWebhookActions {
  getModerationSettings: () => Promise<ModerationSettings>;
  /** Omit a field to leave it alone; pass "" to clear it. Those are different
   *  states on the wire, and on desktop they are exactly the omitted-vs-null
   *  trap the clients CLAUDE.md warns about — the command there must build the
   *  body from the fields that are `Some`. */
  patchModerationSettings: (webhookUrl?: string, webhookSecret?: string) => Promise<void>;
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

export function AutomodWebhookSection({ actions }: { actions: AutomodWebhookActions }) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<ModerationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [secretInput, setSecretInput] = useState("");
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await actions.getModerationSettings();
      setSettings(data);
      setUrlInput(data.webhook_url ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await actions.patchModerationSettings(
        urlInput || undefined,
        secretInput || undefined,
      );
      setSecretInput("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    setError(null);
    try {
      await actions.patchModerationSettings("");
      setUrlInput("");
      setSecretInput("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // The row's own line: what this is set to, without opening it. A circuit
  // that has tripped is the one thing here worth interrupting someone for.
  const stateLine = loading
    ? t("hub.admin.automod.loading")
    : !settings
      ? t("hub.admin.automod.not_configured")
      : [
          settings.webhook_url || t("hub.admin.automod.not_configured"),
          settings.circuit_open
            ? t("hub.admin.automod.circuit_open")
            : t("hub.admin.automod.circuit_closed"),
        ].join(" · ");

  return (
    <SettingRow
      title={t("hub.admin.automod.title")}
      state={stateLine}
      attention={!!settings?.circuit_open}
      open={open}
      onToggle={() => setOpen((v) => !v)}
    >
      {error && <p className="error-text">{error}</p>}
      {!loading && settings && (
        <>
          <div className="settings-section">
            <label className="settings-label" htmlFor="automod-url">{t("hub.admin.automod.url_label")}</label>
            <input
              id="automod-url"
              type="url"
              placeholder="https://your-service.example/moderation"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <div className="settings-section">
            <label className="settings-label" htmlFor="automod-secret">{t("hub.admin.automod.secret")}</label>
            <input
              id="automod-secret"
              type="password"
              placeholder={settings.webhook_secret_set ? "••••••••" : t("hub.admin.automod.secret_placeholder")}
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <div className="settings-row">
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? t("hub.admin.automod.saving") : saved ? t("hub.admin.automod.saved") : t("hub.admin.automod.save")}
            </button>
            {settings.webhook_url && (
              <button className="btn-secondary" onClick={handleClear} disabled={saving}>
                {t("hub.admin.automod.clear")}
              </button>
            )}
          </div>
        </>
      )}
    </SettingRow>
  );
}
