import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BotAdminInfo, BotDetailInfo } from "../types";
import { BotWizard } from "./BotWizard";

interface BotAdminSectionProps {
  hubUrl: string;
  myPubkey: string;
}

export function BotAdminSection({ hubUrl }: BotAdminSectionProps) {
  const [bots, setBots] = useState<BotAdminInfo[]>([]);
  const [selectedPubkey, setSelectedPubkey] = useState<string | null>(null);
  const [detail, setDetail] = useState<BotDetailInfo | null>(null);
  const [webhookValue, setWebhookValue] = useState("");
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadBots() {
    try {
      const list = await invoke<BotAdminInfo[]>("admin_list_bots", { hubUrl });
      setBots(list);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    loadBots();
  }, [hubUrl]);

  async function selectBot(pubkey: string) {
    setSelectedPubkey(pubkey);
    setDetail(null);
    try {
      const d = await invoke<BotDetailInfo>("admin_get_bot_detail", { hubUrl, pubkey });
      setDetail(d);
      setWebhookValue(d.webhook_url ?? "");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSaveWebhook() {
    if (!selectedPubkey) return;
    setSavingWebhook(true);
    try {
      await invoke("admin_set_bot_webhook", {
        hubUrl,
        pubkey: selectedPubkey,
        webhookUrl: webhookValue.trim() || null,
      });
      if (detail) setDetail({ ...detail, webhook_url: webhookValue.trim() || null });
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingWebhook(false);
    }
  }

  async function handleDelete() {
    if (!selectedPubkey) return;
    if (!window.confirm("Delete this bot? This cannot be undone.")) return;
    try {
      await invoke("admin_delete_bot", { hubUrl, pubkey: selectedPubkey });
      setSelectedPubkey(null);
      setDetail(null);
      await loadBots();
    } catch (e) {
      setError(String(e));
    }
  }

  function truncatePk(pk: string) {
    return pk.slice(0, 8) + "…";
  }

  return (
    <section>
      <h1>Bots</h1>
      <p className="muted">
        Bots are hub members with a long-lived API token. Tokens are only
        shown once — copy them immediately after creating.
      </p>

      {error && (
        <p style={{ color: "var(--color-error, red)", marginBottom: "var(--space-3)" }}>{error}</p>
      )}

      {showWizard && (
        <BotWizard
          hubUrl={hubUrl}
          onCreated={async () => {
            setShowWizard(false);
            await loadBots();
          }}
          onClose={() => setShowWizard(false)}
        />
      )}

      <div className="survey-admin-layout">
        <div className="survey-question-list">
          <button className="btn-secondary survey-list-add" onClick={() => setShowWizard(true)}>
            + Create Bot
          </button>
          {bots.length === 0 && (
            <p className="muted" style={{ padding: "var(--space-2)" }}>No bots yet.</p>
          )}
          {bots.map((bot) => (
            <button
              key={bot.public_key}
              className={`survey-question-item${selectedPubkey === bot.public_key ? " active" : ""}`}
              onClick={() => selectBot(bot.public_key)}
            >
              <span className="survey-question-item-prompt">{bot.display_name}</span>
              <span className="survey-question-item-kind muted" title={bot.created_by}>
                {truncatePk(bot.created_by)}
              </span>
            </button>
          ))}
        </div>

        <div className="survey-question-editor">
          {detail ? (
            <div className="survey-editor-panel">
              <div className="settings-section">
                <label className="settings-label">Display name</label>
                <p>{detail.display_name}</p>
              </div>
              <div className="settings-section">
                <label className="settings-label">Created by</label>
                <p className="muted" title={detail.created_by}>{truncatePk(detail.created_by)}</p>
              </div>
              <div className="settings-section">
                <label className="settings-label" htmlFor="bot-webhook-url">Webhook URL</label>
                <div className="settings-row">
                  <input
                    id="bot-webhook-url"
                    type="text"
                    value={webhookValue}
                    onChange={(e) => setWebhookValue(e.target.value)}
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
                <p className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-2)" }}>
                  Bots register their own commands via the API.
                </p>
              </div>
              <div className="settings-section">
                <button
                  className="btn-secondary danger"
                  onClick={handleDelete}
                >
                  Delete bot
                </button>
              </div>
            </div>
          ) : selectedPubkey ? (
            <div className="survey-editor-empty">
              <p className="muted">Loading…</p>
            </div>
          ) : (
            <div className="survey-editor-empty">
              <p className="muted">Select a bot to manage it, or create a new one.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
