import { Fragment, useEffect, useState } from "react";
import { formatPubkey } from "@wavvon/core";
import type { NativeBot, NativeBotCreated, NativeBotDetail } from "../../types";

export interface NativeBotsSectionActions {
  listNativeBots: () => Promise<NativeBot[]>;
  createNativeBot: (input: { display_name: string; mini_app_url?: string; requires_camera?: boolean }) => Promise<NativeBotCreated>;
  deleteNativeBot: (pubkey: string) => Promise<void>;
  getBotDetail: (pubkey: string) => Promise<NativeBotDetail>;
  setBotWebhook: (pubkey: string, webhookUrl: string | null) => Promise<void>;
}

interface Props {
  actions: NativeBotsSectionActions;
}

export function NativeBotsSection({ actions }: Props) {
  const [bots, setBots] = useState<NativeBot[] | null>(null);
  const [name, setName] = useState("");
  const [miniAppUrl, setMiniAppUrl] = useState("");
  const [requiresCamera, setRequiresCamera] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Token is shown exactly once, right after creation (never retrievable later).
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);

  const [expandedPubkey, setExpandedPubkey] = useState<string | null>(null);
  const [detail, setDetail] = useState<NativeBotDetail | null>(null);
  const [webhookInput, setWebhookInput] = useState("");
  const [savingWebhook, setSavingWebhook] = useState(false);

  async function load() {
    setError(null);
    try {
      setBots(await actions.listNativeBots());
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate() {
    const display = name.trim();
    if (!display) return;
    setCreating(true);
    setError(null);
    try {
      const bot = await actions.createNativeBot({
        display_name: display,
        mini_app_url: miniAppUrl.trim() || undefined,
        requires_camera: requiresCamera || undefined,
      });
      setNewToken({ name: bot.display_name, token: bot.token });
      setName("");
      setMiniAppUrl("");
      setRequiresCamera(false);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(bot: NativeBot) {
    if (!window.confirm(`Delete bot "${bot.display_name}"? Its token stops working.`)) return;
    setError(null);
    try {
      await actions.deleteNativeBot(bot.public_key);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function toggleDetail(pubkey: string) {
    if (expandedPubkey === pubkey) {
      setExpandedPubkey(null);
      return;
    }
    setExpandedPubkey(pubkey);
    setDetail(null);
    try {
      const d = await actions.getBotDetail(pubkey);
      setDetail(d);
      setWebhookInput(d.webhook_url ?? "");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSaveWebhook() {
    if (!expandedPubkey) return;
    setSavingWebhook(true);
    try {
      await actions.setBotWebhook(expandedPubkey, webhookInput.trim() || null);
      if (detail) setDetail({ ...detail, webhook_url: webhookInput.trim() || null });
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingWebhook(false);
    }
  }

  return (
    <section>
      <h1>Native bots</h1>
      <p className="muted">First-party bots that live on this hub itself, as opposed to externally-hosted bots. Creating one returns a token — copy it now, it can't be shown again.</p>
      {error && bots !== null && <p className="error-text">{error}</p>}

      <div className="settings-section">
        <div className="settings-row" style={{ gap: "var(--space-2)" }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            placeholder="Bot name"
            aria-label="Bot name"
          />
          <input
            type="text"
            value={miniAppUrl}
            onChange={(e) => setMiniAppUrl(e.target.value)}
            placeholder="Mini-app URL (optional)"
            aria-label="Mini-app URL"
            style={{ flex: 1 }}
          />
          <label className="checkbox-label" style={{ fontSize: "var(--text-sm)" }}>
            <input type="checkbox" checked={requiresCamera} onChange={(e) => setRequiresCamera(e.target.checked)} />
            Requires camera
          </label>
          <button onClick={handleCreate} disabled={creating || !name.trim()}>Create bot</button>
        </div>
      </div>

      {newToken && (
        <div className="settings-section" style={{ border: "1px solid var(--accent)", borderRadius: "var(--r-md)", padding: "var(--space-3)", marginTop: "var(--space-2)" }}>
          <p style={{ margin: 0 }}><strong>{newToken.name}</strong> created. Token (shown once):</p>
          <code className="pubkey-display" style={{ wordBreak: "break-all" }}>{newToken.token}</code>
          <div><button className="btn-small" onClick={() => setNewToken(null)}>Done</button></div>
        </div>
      )}

      {bots === null ? (
        error ? <p className="error-text">{error}</p> : <p className="muted">Loading…</p>
      ) : bots.length === 0 ? (
        <p className="muted" style={{ marginTop: "var(--space-3)" }}>No bots yet.</p>
      ) : (
        <table className="members-table" style={{ marginTop: "var(--space-3)" }}>
          <thead><tr><th>Name</th><th>Key</th><th>Actions</th></tr></thead>
          <tbody>
            {bots.map((b) => (
              <Fragment key={b.public_key}>
                <tr>
                  <td>{b.display_name}</td>
                  <td><span className="member-pk">{formatPubkey(b.public_key)}</span></td>
                  <td style={{ display: "flex", gap: "var(--space-2)" }}>
                    <button className="btn-small btn-secondary" onClick={() => toggleDetail(b.public_key)}>
                      {expandedPubkey === b.public_key ? "Hide" : "Manage"}
                    </button>
                    <button className="btn-small btn-secondary danger" onClick={() => handleDelete(b)}>Delete</button>
                  </td>
                </tr>
                {expandedPubkey === b.public_key && (
                  <tr>
                    <td colSpan={3}>
                      {detail === null ? (
                        <p className="muted">Loading…</p>
                      ) : (
                        <div style={{ padding: "var(--space-2) var(--space-3)", background: "var(--bg-secondary, rgba(0,0,0,0.1))", borderRadius: "var(--r-md)" }}>
                          <div className="settings-section">
                            <label className="settings-label" htmlFor="bot-webhook-url">Webhook URL</label>
                            <div className="settings-row">
                              <input
                                id="bot-webhook-url"
                                type="text"
                                value={webhookInput}
                                onChange={(e) => setWebhookInput(e.target.value)}
                                placeholder="https://…"
                                style={{ flex: 1 }}
                              />
                              <button onClick={handleSaveWebhook} disabled={savingWebhook}>
                                {savingWebhook ? "Saving…" : "Save"}
                              </button>
                            </div>
                          </div>
                          <div className="settings-section">
                            <label className="settings-label">Registered slash commands</label>
                            {detail.commands.length === 0 ? (
                              <p className="muted">No commands registered.</p>
                            ) : (
                              <table className="members-table">
                                <thead>
                                  <tr>
                                    <th>Command</th>
                                    <th>Description</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detail.commands.map((cmd) => (
                                    <tr key={cmd.command}>
                                      <td><code>/{cmd.command}</code></td>
                                      <td>{cmd.description}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
