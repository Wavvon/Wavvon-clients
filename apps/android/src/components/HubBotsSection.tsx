import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BotInfo } from "../types";

export function HubBotsSection() {
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    invoke<BotInfo[]>("list_bots")
      .then((list) => { setBots(list); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, []);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const bot = await invoke<BotInfo>("create_bot", { name });
      if (bot.token) setRevealedToken(bot.token);
      setNewName("");
      const updated = await invoke<BotInfo[]>("list_bots");
      setBots(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleRotateToken(publicKey: string) {
    setError(null);
    try {
      const token = await invoke<string>("rotate_bot_token", { publicKey });
      setRevealedToken(token);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDelete(publicKey: string) {
    if (!window.confirm("Delete this bot? This cannot be undone.")) return;
    setError(null);
    try {
      await invoke("delete_bot", { publicKey });
      setBots((prev) => prev.filter((b) => b.public_key !== publicKey));
    } catch (e) {
      setError(String(e));
    }
  }

  function handleCopy() {
    if (!revealedToken) return;
    navigator.clipboard.writeText(revealedToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function truncatePk(pk: string) {
    return pk.slice(0, 8) + "…";
  }

  return (
    <div>
      {error && (
        <p style={{ color: "var(--color-error, red)", marginBottom: "8px" }}>{error}</p>
      )}

      {revealedToken && (
        <div className="bot-token-reveal">
          <p className="bot-token-warning">
            Copy this token now — it won't be shown again.
          </p>
          <code className="bot-token-value">{revealedToken}</code>
          <div className="bot-token-actions">
            <button onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              className="btn-secondary"
              onClick={() => { setRevealedToken(null); setCopied(false); }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="settings-section">
        <label className="settings-label" htmlFor="new-bot-name">Create bot</label>
        <div className="settings-row">
          <input
            id="new-bot-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Bot name"
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            style={{ flex: 1 }}
          />
          <button onClick={handleCreate} disabled={creating || !newName.trim()}>
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {!loading && bots.length === 0 && (
        <p className="muted">No bots yet. Create one above.</p>
      )}
      {bots.map((bot) => (
        <div key={bot.public_key} className="settings-section bot-row">
          <div className="bot-row-info">
            <span className="bot-row-name">{bot.display_name}</span>
            <span className="muted" title={bot.public_key}>
              {truncatePk(bot.public_key)}
            </span>
            <span className="muted">
              Created by: <span title={bot.created_by}>{truncatePk(bot.created_by)}</span>
            </span>
          </div>
          <div className="bot-row-actions">
            <button
              className="btn-secondary"
              onClick={() => handleRotateToken(bot.public_key)}
            >
              Rotate Token
            </button>
            <button
              className="btn-secondary danger"
              onClick={() => handleDelete(bot.public_key)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
