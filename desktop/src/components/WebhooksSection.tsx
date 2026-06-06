import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { Channel, WebhookInfo, WebhookCreatedResult } from "../types";
import { formatRelative } from "../utils/format";

interface Props {
  hubUrl: string;
  channels: Channel[];
}

function maskUrl(url: string): string {
  const idx = url.lastIndexOf("/");
  if (idx < 0) return url;
  return url.slice(0, idx + 1) + "****";
}

export function WebhooksSection({ hubUrl, channels }: Props) {
  const { t } = useTranslation();
  const [webhooks, setWebhooks] = useState<WebhookInfo[]>([]);
  const [channelId, setChannelId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdResult, setCreatedResult] = useState<WebhookCreatedResult | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [regeneratedUrl, setRegeneratedUrl] = useState<string | null>(null);
  const [copiedRegen, setCopiedRegen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textChannels = channels.filter((c) => !c.is_category);

  async function loadWebhooks() {
    try {
      const list = await invoke<WebhookInfo[]>("admin_list_webhooks", { hubUrl });
      setWebhooks(list);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    loadWebhooks();
  }, [hubUrl]);

  async function handleCreate() {
    if (!channelId || !displayName.trim()) return;
    setCreating(true);
    setError(null);
    setCreatedResult(null);
    try {
      const result = await invoke<WebhookCreatedResult>("admin_create_webhook", {
        hubUrl,
        channelId,
        displayName: displayName.trim(),
        avatarUrl: avatarUrl.trim() || null,
      });
      setCreatedResult(result);
      setChannelId("");
      setDisplayName("");
      setAvatarUrl("");
      await loadWebhooks();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleRegenerate(id: string) {
    setError(null);
    setRegeneratedUrl(null);
    try {
      const result = await invoke<WebhookCreatedResult>("admin_regenerate_webhook", { hubUrl, webhookId: id });
      setRegeneratedUrl(result.webhook_url);
      await loadWebhooks();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("webhooks.delete") + "?")) return;
    try {
      await invoke("admin_delete_webhook", { hubUrl, webhookId: id });
      await loadWebhooks();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <section>
      <h1>{t("webhooks.title")}</h1>

      <h2>{t("webhooks.section")}</h2>
      <p className="muted">
        {t("webhooks.hint")}
      </p>

      {error && (
        <p style={{ color: "var(--color-error, red)", marginBottom: "var(--space-3)" }}>{error}</p>
      )}

      <div className="settings-section">
        <label className="settings-label" htmlFor="webhook-channel">{t("webhooks.channel.label")}</label>
        <select id="webhook-channel" value={channelId} onChange={(e) => setChannelId(e.target.value)} style={{ width: "100%" }}>
          <option value="">{t("webhooks.channel.placeholder")}</option>
          {textChannels.map((ch) => (
            <option key={ch.id} value={ch.id}>#{ch.name}</option>
          ))}
        </select>
      </div>
      <div className="settings-section">
        <label className="settings-label" htmlFor="webhook-name">{t("webhooks.name.label")}</label>
        <input
          id="webhook-name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t("webhooks.name.placeholder")}
          style={{ width: "100%" }}
        />
      </div>
      <div className="settings-section">
        <label className="settings-label" htmlFor="webhook-avatar">{t("webhooks.avatar.label")}</label>
        <input
          id="webhook-avatar"
          type="text"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://…"
          style={{ width: "100%" }}
        />
      </div>
      <div className="settings-section">
        <button onClick={handleCreate} disabled={creating || !channelId || !displayName.trim()}>
          {creating ? t("webhooks.creating") : t("webhooks.create")}
        </button>
      </div>

      {createdResult && (
        <div className="bot-token-reveal">
          <p className="bot-token-warning">
            {t("webhooks.secret_warning")}
          </p>
          <code className="bot-token-value">{createdResult.webhook_url}</code>
          <div className="bot-token-actions">
            <button
              onClick={() => {
                navigator.clipboard.writeText(createdResult.webhook_url);
                setCopiedUrl(true);
                setTimeout(() => setCopiedUrl(false), 2000);
              }}
            >
              {copiedUrl ? t("webhooks.copied") : t("webhooks.copy_url")}
            </button>
            <button className="btn-secondary" onClick={() => setCreatedResult(null)}>
              {t("webhooks.dismiss")}
            </button>
          </div>
        </div>
      )}

      {regeneratedUrl && (
        <div className="bot-token-reveal">
          <p className="bot-token-warning">
            {t("webhooks.regen_warning")}
          </p>
          <code className="bot-token-value">{regeneratedUrl}</code>
          <div className="bot-token-actions">
            <button
              onClick={() => {
                navigator.clipboard.writeText(regeneratedUrl);
                setCopiedRegen(true);
                setTimeout(() => setCopiedRegen(false), 2000);
              }}
            >
              {copiedRegen ? t("webhooks.copied") : t("webhooks.copy_url")}
            </button>
            <button className="btn-secondary" onClick={() => setRegeneratedUrl(null)}>
              {t("webhooks.dismiss")}
            </button>
          </div>
        </div>
      )}

      {webhooks.length === 0 ? (
        <p className="muted">{t("webhooks.empty")}</p>
      ) : (
        <table className="members-table" style={{ marginTop: "var(--space-4)" }}>
          <thead>
            <tr>
              <th>{t("webhooks.col.name")}</th>
              <th>{t("webhooks.col.channel")}</th>
              <th>{t("webhooks.col.url")}</th>
              <th>{t("webhooks.col.created")}</th>
              <th>{t("webhooks.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {webhooks.map((wh) => (
              <tr key={wh.id}>
                <td>{wh.display_name}</td>
                <td>{wh.channel_name ? `#${wh.channel_name}` : wh.channel_id.slice(0, 8)}</td>
                <td><code className="muted" style={{ fontSize: "var(--text-xs)" }}>{maskUrl(wh.webhook_url)}</code></td>
                <td>{formatRelative(wh.created_at)}</td>
                <td style={{ display: "flex", gap: "var(--space-2)" }}>
                  <button className="btn-small btn-secondary" onClick={() => handleRegenerate(wh.id)}>
                    {t("webhooks.regenerate")}
                  </button>
                  <button className="btn-small btn-secondary danger" onClick={() => handleDelete(wh.id)}>
                    {t("webhooks.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
