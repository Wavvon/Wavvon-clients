import React, { useEffect, useState } from "react";
import type { Channel, ExternalBotRow, ExternalBotInviteResult } from "../types";
import {
  adminListExternalBots,
  adminAddExternalBot,
  adminRemoveExternalBot,
  adminSetBotChannelScope,
} from "../platform/commands/bots";

interface Props {
  channels: Channel[];
}

interface ChannelScope {
  expanded: boolean;
  restricted: boolean;
  selectedIds: Set<string>;
  saving: boolean;
}

function truncatePk(pk: string) {
  return pk.slice(0, 8) + "…";
}

function formatRelative(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function ExternalBotSection({ channels }: Props) {
  const [bots, setBots] = useState<ExternalBotRow[]>([]);
  const [pubkeyInput, setPubkeyInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [inviteResult, setInviteResult] = useState<ExternalBotInviteResult | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scopeState, setScopeState] = useState<Record<string, ChannelScope>>({});

  const textChannels = channels.filter((c) => !c.is_category);

  async function loadBots() {
    try {
      const list = await adminListExternalBots();
      setBots(list);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    loadBots();
  }, []);

  async function handleGenerate() {
    const pk = pubkeyInput.trim();
    if (!pk) return;
    setGenerating(true);
    setError(null);
    setInviteResult(null);
    try {
      const result = await adminAddExternalBot(pk, noteInput.trim() || null);
      setInviteResult(result);
      setPubkeyInput("");
      setNoteInput("");
      await loadBots();
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function handleRemove(pubkey: string) {
    if (!window.confirm("Remove this external bot?")) return;
    try {
      await adminRemoveExternalBot(pubkey);
      await loadBots();
    } catch (e) {
      setError(String(e));
    }
  }

  function toggleScope(pubkey: string) {
    setScopeState((prev) => ({
      ...prev,
      [pubkey]: {
        expanded: !prev[pubkey]?.expanded,
        restricted: prev[pubkey]?.restricted ?? false,
        selectedIds: prev[pubkey]?.selectedIds ?? new Set(),
        saving: false,
      },
    }));
  }

  function toggleRestricted(pubkey: string, val: boolean) {
    setScopeState((prev) => ({
      ...prev,
      [pubkey]: { ...(prev[pubkey] ?? { expanded: true, selectedIds: new Set(), saving: false }), restricted: val },
    }));
  }

  function toggleChannelId(pubkey: string, channelId: string) {
    setScopeState((prev) => {
      const cur = prev[pubkey] ?? { expanded: true, restricted: true, selectedIds: new Set(), saving: false };
      const next = new Set(cur.selectedIds);
      if (next.has(channelId)) next.delete(channelId); else next.add(channelId);
      return { ...prev, [pubkey]: { ...cur, selectedIds: next } };
    });
  }

  async function saveScope(pubkey: string) {
    const cur = scopeState[pubkey];
    if (!cur) return;
    setScopeState((prev) => ({ ...prev, [pubkey]: { ...prev[pubkey], saving: true } }));
    try {
      const channelIds = cur.restricted ? Array.from(cur.selectedIds) : [];
      await adminSetBotChannelScope(pubkey, channelIds);
    } catch (e) {
      setError(String(e));
    } finally {
      setScopeState((prev) => ({ ...prev, [pubkey]: { ...prev[pubkey], saving: false } }));
    }
  }

  function statusLabel(status: ExternalBotRow["approval_status"]) {
    if (status === "pending") return "Pending invite";
    if (status === "active") return "Active";
    return "Removed";
  }

  return (
    <div>
      <h2 style={{ marginTop: "var(--space-6)" }}>External Bots</h2>
      <p className="muted">
        Add a bot operated externally. Generate an invite token and share it with the bot operator.
      </p>

      {error && (
        <p style={{ color: "var(--color-error, red)", marginBottom: "var(--space-3)" }}>{error}</p>
      )}

      <div className="settings-section">
        <label className="settings-label">Bot public key (hex)</label>
        <input
          type="text"
          value={pubkeyInput}
          onChange={(e) => setPubkeyInput(e.target.value)}
          placeholder="hex pubkey"
          style={{ width: "100%" }}
        />
      </div>
      <div className="settings-section">
        <label className="settings-label">Local note (optional)</label>
        <input
          type="text"
          value={noteInput}
          onChange={(e) => setNoteInput(e.target.value)}
          placeholder="e.g. moderation bot"
          style={{ width: "100%" }}
        />
      </div>
      <div className="settings-section">
        <button onClick={handleGenerate} disabled={generating || !pubkeyInput.trim()}>
          {generating ? "Generating…" : "Generate invite token"}
        </button>
      </div>

      {inviteResult && (
        <div className="bot-token-reveal">
          <p className="bot-token-warning">
            Share this token with the bot operator. It expires in 24 hours.
          </p>
          <code className="bot-token-value">{inviteResult.bot_invite_token}</code>
          <div className="bot-token-actions">
            <button
              onClick={() => {
                navigator.clipboard.writeText(inviteResult.bot_invite_token);
                setCopiedToken(true);
                setTimeout(() => setCopiedToken(false), 2000);
              }}
            >
              {copiedToken ? "Copied!" : "Copy token"}
            </button>
            <button className="btn-secondary" onClick={() => setInviteResult(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {bots.length === 0 ? (
        <p className="muted">No external bots yet.</p>
      ) : (
        <table className="members-table" style={{ marginTop: "var(--space-4)" }}>
          <thead>
            <tr>
              <th>Name / note</th>
              <th>Pubkey</th>
              <th>Status</th>
              <th>Last seen</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bots.map((bot) => {
              const scope = scopeState[bot.public_key];
              return (
                <React.Fragment key={bot.public_key}>
                  <tr>
                    <td>{bot.local_note ?? bot.display_name ?? <span className="muted">(unnamed)</span>}</td>
                    <td><code title={bot.public_key}>{truncatePk(bot.public_key)}</code></td>
                    <td>{statusLabel(bot.approval_status)}</td>
                    <td>{bot.last_seen_at ? formatRelative(bot.last_seen_at) : <span className="muted">—</span>}</td>
                    <td style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      <button className="btn-small btn-secondary" onClick={() => toggleScope(bot.public_key)}>
                        {scope?.expanded ? "Hide access" : "Channel access"}
                      </button>
                      <button className="btn-small btn-secondary danger" onClick={() => handleRemove(bot.public_key)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                  {scope?.expanded && (
                    <tr>
                      <td colSpan={5}>
                        <div style={{ padding: "var(--space-2) var(--space-3)", background: "var(--bg-secondary, rgba(0,0,0,0.1))", borderRadius: "var(--r-md)" }}>
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={scope.restricted}
                              onChange={(e) => toggleRestricted(bot.public_key, e.target.checked)}
                            />
                            Restrict to specific channels
                          </label>
                          {scope.restricted && (
                            <div style={{ marginTop: "var(--space-2)", display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                              {textChannels.map((ch) => (
                                <label key={ch.id} className="checkbox-label">
                                  <input
                                    type="checkbox"
                                    checked={scope.selectedIds.has(ch.id)}
                                    onChange={() => toggleChannelId(bot.public_key, ch.id)}
                                  />
                                  #{ch.name}
                                </label>
                              ))}
                            </div>
                          )}
                          <div style={{ marginTop: "var(--space-3)" }}>
                            <button onClick={() => saveScope(bot.public_key)} disabled={scope.saving}>
                              {scope.saving ? "Saving…" : "Save access"}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
