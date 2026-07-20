import { useEffect, useState } from "react";
import type { ModerationSettings } from "@shared/types";
import { getModerationSettings, patchModerationSettings } from "../../platform/commands/moderation";

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

export function AutomodWebhookSection() {
  const [settings, setSettings] = useState<ModerationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [secretInput, setSecretInput] = useState("");
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getModerationSettings();
      setSettings(data);
      setUrlInput(data.webhook_url ?? "");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await patchModerationSettings(
        urlInput || undefined,
        secretInput || undefined,
      );
      setSecretInput("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    setError(null);
    try {
      await patchModerationSettings("");
      setUrlInput("");
      setSecretInput("");
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-section">
      <h2>Auto-moderation Webhook</h2>
      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && settings && (
        <>
          <div className="settings-row">
            <span className="settings-label">Current URL</span>
            <span className="muted">{settings.webhook_url || "Not configured"}</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Secret</span>
            <span className="muted">{settings.webhook_secret_set ? "Set" : "Not set"}</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Circuit breaker</span>
            {settings.circuit_open ? (
              <span
                className="badge-chip"
                style={{ borderColor: "var(--warning)", color: "var(--warning)" }}
              >
                Circuit open
                {settings.circuit_open_until
                  ? ` — until ${formatTimestamp(settings.circuit_open_until)}`
                  : ""}
              </span>
            ) : (
              <span className="badge-chip">Circuit closed</span>
            )}
          </div>
          <div className="settings-section">
            <label className="settings-label" htmlFor="automod-url">Webhook URL</label>
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
            <label className="settings-label" htmlFor="automod-secret">Secret</label>
            <input
              id="automod-secret"
              type="password"
              placeholder={settings.webhook_secret_set ? "••••••••" : "Enter secret…"}
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <div className="settings-row">
            <button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : saved ? "Saved!" : "Save"}
            </button>
            {settings.webhook_url && (
              <button className="btn-secondary" onClick={handleClear} disabled={saving}>
                Clear (disable webhook)
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
