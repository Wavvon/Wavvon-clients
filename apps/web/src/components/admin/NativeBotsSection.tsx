import { useEffect, useState } from "react";
import { listNativeBots, createNativeBot, deleteNativeBot } from "@platform";
import type { NativeBot } from "@platform";
import { HubApiError } from "../../platform/http";
import { formatPubkey } from "@wavvon/core";
import { ErrorRetry } from "@wavvon/ui";

export function NativeBotsSection() {
  const [bots, setBots] = useState<NativeBot[] | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Token is shown exactly once, right after creation (never retrievable later).
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);

  async function load() {
    setError(null);
    try {
      setBots(await listNativeBots());
    } catch (e) {
      setError(e instanceof HubApiError ? e.message : String(e));
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate() {
    const display = name.trim();
    if (!display) return;
    setCreating(true);
    setError(null);
    try {
      const bot = await createNativeBot({ display_name: display });
      setNewToken({ name: bot.display_name, token: bot.token });
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(bot: NativeBot) {
    if (!window.confirm(`Delete bot "${bot.display_name}"? Its token stops working.`)) return;
    setError(null);
    try {
      await deleteNativeBot(bot.public_key);
      await load();
    } catch (e) {
      setError(e instanceof HubApiError ? e.message : String(e));
    }
  }

  return (
    <section>
      <h1>Native bots</h1>
      <p className="muted">First-party bots that live on this hub itself, as opposed to externally-hosted bots. Creating one returns a token — copy it now, it can't be shown again.</p>
      {error && bots !== null && <p className="error-text">{error}</p>}

      <div className="settings-row" style={{ gap: "var(--space-2)" }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          placeholder="Bot name"
          aria-label="Bot name"
        />
        <button onClick={handleCreate} disabled={creating || !name.trim()}>Create bot</button>
      </div>

      {newToken && (
        <div className="settings-section" style={{ border: "1px solid var(--accent)", borderRadius: "var(--r-md)", padding: "var(--space-3)", marginTop: "var(--space-2)" }}>
          <p style={{ margin: 0 }}><strong>{newToken.name}</strong> created. Token (shown once):</p>
          <code className="pubkey-display" style={{ wordBreak: "break-all" }}>{newToken.token}</code>
          <div><button className="btn-small" onClick={() => setNewToken(null)}>Done</button></div>
        </div>
      )}

      {bots === null ? (
        error ? <ErrorRetry message={error} onRetry={load} /> : <p className="muted">Loading…</p>
      ) : bots.length === 0 ? (
        <p className="muted" style={{ marginTop: "var(--space-3)" }}>No bots yet.</p>
      ) : (
        <table className="members-table" style={{ marginTop: "var(--space-3)" }}>
          <thead><tr><th>Name</th><th>Key</th><th>Actions</th></tr></thead>
          <tbody>
            {bots.map((b) => (
              <tr key={b.public_key}>
                <td>{b.display_name}</td>
                <td><span className="member-pk">{formatPubkey(b.public_key)}</span></td>
                <td><button className="btn-small btn-secondary danger" onClick={() => handleDelete(b)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
