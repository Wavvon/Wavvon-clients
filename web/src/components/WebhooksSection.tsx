import { useEffect, useState } from "react";
import type { Channel, WebhookInfo, WebhookCreatedResult } from "../types";
import {
  adminListWebhooks,
  adminCreateWebhook,
  adminRegenerateWebhook,
  adminDeleteWebhook,
} from "../platform/commands/bots";

interface Props {
  channels: Channel[];
}

function maskUrl(url: string): string {
  const idx = url.lastIndexOf("/");
  if (idx < 0) return url;
  return url.slice(0, idx + 1) + "****";
}

function formatRelative(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function WebhooksSection({ channels }: Props) {
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
      const list = await adminListWebhooks();
      setWebhooks(list);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    loadWebhooks();
  }, []);

  async function handleCreate() {
    if (!channelId || !displayName.trim()) return;
    setCreating(true);
    setError(null);
    setCreatedResult(null);
    try {
      const result = await adminCreateWebhook(channelId, displayName.trim(), avatarUrl.trim() || null);
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
      const result = await adminRegenerateWebhook(id);
      setRegeneratedUrl(result.webhook_url);
      await loadWebhooks();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this webhook? The URL will stop working immediately.")) return;
    try {
      await adminDeleteWebhook(id);
      await loadWebhooks();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <section>
      <h1>Integrations</h1>

      <h2>Incoming Webhooks</h2>
      <p className="muted">
        Webhooks let external services post messages into a channel using a simple HTTP POST.
      </p>

      {error && (
        <p style={{ color: "var(--color-error, red)", marginBottom: "var(--space-3)" }}>{error}</p>
      )}

      <div className="settings-section">
        <label className="settings-label">Channel</label>
        <select value={channelId} onChange={(e) => setChannelId(e.target.value)} style={{ width: "100%" }}>
          <option value="">Select a channel…</option>
          {textChannels.map((ch) => (
            <option key={ch.id} value={ch.id}>#{ch.name}</option>
          ))}
        </select>
      </div>
      <div className="settings-section">
        <label className="settings-label">Display name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="My Integration"
          style={{ width: "100%" }}
        />
      </div>
      <div className="settings-section">
        <label className="settings-label">Avatar URL (optional)</label>
        <input
          type="text"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://…"
          style={{ width: "100%" }}
        />
      </div>
      <div className="settings-section">
        <button onClick={handleCreate} disabled={creating || !channelId || !displayName.trim()}>
          {creating ? "Creating…" : "Create webhook"}
        </button>
      </div>

      {createdResult && (
        <div className="bot-token-reveal">
          <p className="bot-token-warning">
            This URL contains a secret. Save it now — it won't be shown again.
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
              {copiedUrl ? "Copied!" : "Copy URL"}
            </button>
            <button className="btn-secondary" onClick={() => setCreatedResult(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {regeneratedUrl && (
        <div className="bot-token-reveal">
          <p className="bot-token-warning">
            New webhook URL — save it now.
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
              {copiedRegen ? "Copied!" : "Copy URL"}
            </button>
            <button className="btn-secondary" onClick={() => setRegeneratedUrl(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {webhooks.length === 0 ? (
        <p className="muted">No webhooks yet.</p>
      ) : (
        <table className="members-table" style={{ marginTop: "var(--space-4)" }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Channel</th>
              <th>URL (masked)</th>
              <th>Created</th>
              <th>Actions</th>
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
                    Regenerate
                  </button>
                  <button className="btn-small btn-secondary danger" onClick={() => handleDelete(wh.id)}>
                    Delete
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
