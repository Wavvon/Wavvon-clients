import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { Channel, ExternalBotRow, ExternalBotInviteResult } from "../types";
import { formatRelative } from "@voxply/utils";

interface Props {
  hubUrl: string;
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

export function ExternalBotSection({ hubUrl, channels }: Props) {
  const { t } = useTranslation();
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
      const list = await invoke<ExternalBotRow[]>("admin_list_external_bots", { hubUrl });
      setBots(list);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    loadBots();
  }, [hubUrl]);

  async function handleGenerate() {
    const pk = pubkeyInput.trim();
    if (!pk) return;
    setGenerating(true);
    setError(null);
    setInviteResult(null);
    try {
      const result = await invoke<ExternalBotInviteResult>("admin_add_external_bot", {
        hubUrl,
        pubkey: pk,
        localNote: noteInput.trim() || null,
      });
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
    if (!window.confirm(t("ext_bot.remove") + "?")) return;
    try {
      await invoke("admin_remove_external_bot", { hubUrl, pubkey });
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
      await invoke("admin_set_bot_channel_scope", { hubUrl, pubkey, channelIds });
    } catch (e) {
      setError(String(e));
    } finally {
      setScopeState((prev) => ({ ...prev, [pubkey]: { ...prev[pubkey], saving: false } }));
    }
  }

  function statusLabel(status: ExternalBotRow["approval_status"]) {
    if (status === "pending") return t("ext_bot.status.pending");
    if (status === "active") return t("ext_bot.status.active");
    return t("ext_bot.status.removed");
  }

  return (
    <div>
      <h2 style={{ marginTop: "var(--space-6)" }}>{t("ext_bot.section.title")}</h2>
      <p className="muted">
        {t("ext_bot.section.hint")}
      </p>

      {error && (
        <p style={{ color: "var(--color-error, red)", marginBottom: "var(--space-3)" }}>{error}</p>
      )}

      <div className="settings-section">
        <label className="settings-label" htmlFor="ext-bot-pubkey">{t("ext_bot.pubkey.label")}</label>
        <input
          id="ext-bot-pubkey"
          type="text"
          value={pubkeyInput}
          onChange={(e) => setPubkeyInput(e.target.value)}
          placeholder={t("ext_bot.pubkey.placeholder")}
          style={{ width: "100%" }}
        />
      </div>
      <div className="settings-section">
        <label className="settings-label" htmlFor="ext-bot-note">{t("ext_bot.note.label")}</label>
        <input
          id="ext-bot-note"
          type="text"
          value={noteInput}
          onChange={(e) => setNoteInput(e.target.value)}
          placeholder={t("ext_bot.note.placeholder")}
          style={{ width: "100%" }}
        />
      </div>
      <div className="settings-section">
        <button onClick={handleGenerate} disabled={generating || !pubkeyInput.trim()}>
          {generating ? t("ext_bot.generating") : t("ext_bot.generate")}
        </button>
      </div>

      {inviteResult && (
        <div className="bot-token-reveal">
          <p className="bot-token-warning">
            {t("ext_bot.token.warning")}
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
              {copiedToken ? t("ext_bot.token.copied") : t("ext_bot.token.copy")}
            </button>
            <button className="btn-secondary" onClick={() => setInviteResult(null)}>
              {t("ext_bot.token.dismiss")}
            </button>
          </div>
        </div>
      )}

      {bots.length === 0 ? (
        <p className="muted">{t("ext_bot.empty")}</p>
      ) : (
        <table className="members-table" style={{ marginTop: "var(--space-4)" }}>
          <thead>
            <tr>
              <th>{t("ext_bot.col.name")}</th>
              <th>{t("ext_bot.col.pubkey")}</th>
              <th>{t("ext_bot.col.status")}</th>
              <th>{t("ext_bot.col.last_seen")}</th>
              <th>{t("ext_bot.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {bots.map((bot) => {
              const scope = scopeState[bot.public_key];
              return (
                <React.Fragment key={bot.public_key}>
                  <tr>
                    <td>{bot.local_note ?? bot.display_name ?? <span className="muted">{t("ext_bot.unnamed")}</span>}</td>
                    <td><code title={bot.public_key}>{truncatePk(bot.public_key)}</code></td>
                    <td>{statusLabel(bot.approval_status)}</td>
                    <td>{bot.last_seen_at ? formatRelative(bot.last_seen_at) : <span className="muted">—</span>}</td>
                    <td style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      <button className="btn-small btn-secondary" onClick={() => toggleScope(bot.public_key)}>
                        {scope?.expanded ? t("ext_bot.scope.hide") : t("ext_bot.scope.show")}
                      </button>
                      <button className="btn-small btn-secondary danger" onClick={() => handleRemove(bot.public_key)}>
                        {t("ext_bot.remove")}
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
                            {t("ext_bot.scope.restrict")}
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
                              {scope.saving ? t("ext_bot.scope.saving") : t("ext_bot.scope.save")}
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
