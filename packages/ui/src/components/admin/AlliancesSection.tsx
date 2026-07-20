import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildChannelTree, flattenTree, type Channel } from "@wavvon/core";
import { ErrorRetry } from "../ErrorRetry";
import type { Alliance, PendingAllianceInvite, SharedChannel } from "../../types";

export interface AlliancesSectionActions {
  listAlliances: () => Promise<Alliance[]>;
  createAlliance: (name: string) => Promise<Alliance>;
  leaveAlliance: (allianceId: string) => Promise<void>;
  listPendingAllianceInvites: () => Promise<PendingAllianceInvite[]>;
  acceptAllianceInvite: (inviteId: string, ownHubUrl: string) => Promise<void>;
  declineAllianceInvite: (inviteId: string) => Promise<void>;
  listAllianceSharedChannels: (allianceId: string) => Promise<SharedChannel[]>;
  shareChannelWithAlliance: (allianceId: string, channelId: string, includeDescendants?: boolean) => Promise<void>;
  unshareChannelFromAlliance: (allianceId: string, channelId: string) => Promise<void>;
}

interface Props {
  activeHubUrl: string;
  channels: Channel[];
  actions: AlliancesSectionActions;
}

function sharedChannelIcon(s: SharedChannel): string {
  if (s.is_category) return "📁";
  switch (s.channel_type) {
    case "forum": return "💬";
    case "banner": return "🖼️";
    case "spawner": return "🎙️";
    default: return "#";
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Per-alliance shared-channel manager (expanded on demand).
function AllianceRow({ alliance, myChannels, busy, onLeave, onError, runGuard, actions }: {
  alliance: Alliance;
  myChannels: Channel[];
  busy: boolean;
  onLeave: () => void;
  onError: (m: string) => void;
  runGuard: (fn: () => Promise<void>) => void;
  actions: AlliancesSectionActions;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [shared, setShared] = useState<SharedChannel[] | null>(null);
  const [sharedError, setSharedError] = useState<string | null>(null);
  const [toShare, setToShare] = useState("");

  const shareableChannels = useMemo(
    () => flattenTree(buildChannelTree(myChannels)),
    [myChannels]
  );
  const selectedToShare = shareableChannels.find((f) => f.node.id === toShare)?.node ?? null;

  async function loadShared() {
    setSharedError(null);
    try { setShared(await actions.listAllianceSharedChannels(alliance.id)); }
    catch (e) {
      const msg = errorMessage(e);
      setSharedError(msg);
      onError(msg);
    }
  }

  useEffect(() => { if (open && shared === null) void loadShared(); }, [open]);

  return (
    <div className="settings-section alliance-row" style={{ borderLeft: "2px solid var(--border)", paddingLeft: "var(--space-2)" }}>
      <div className="settings-row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <button className="btn-ghost" onClick={() => setOpen((v) => !v)} style={{ fontWeight: 600 }}>
          {open ? "▾" : "▸"} {alliance.name}
        </button>
        <button className="btn-small btn-secondary danger" disabled={busy} onClick={onLeave}>Leave</button>
      </div>
      {open && (
        <div style={{ paddingLeft: "var(--space-3)" }}>
          <label className="settings-label" style={{ fontSize: "var(--text-xs)" }}>Shared channels</label>
          {shared === null ? (
            sharedError ? <ErrorRetry message={sharedError} onRetry={loadShared} /> : <p className="muted">Loading…</p>
          ) : shared.length === 0 ? (
            <p className="muted" style={{ fontSize: "var(--text-sm)" }}>No channels shared yet.</p>
          ) : (
            shared.map((s) => (
              <div key={`${s.hub_public_key}:${s.channel_id}`} className="settings-row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "var(--text-sm)" }}>
                  {sharedChannelIcon(s)} {s.channel_name}
                  {s.is_category && s.parent_id === null && (
                    <span className="muted"> {t("alliances.share.recursive_marker")}</span>
                  )}
                  {" "}<span className="muted">({s.hub_name})</span>
                </span>
                <button
                  className="btn-small btn-secondary"
                  disabled={busy}
                  onClick={() => runGuard(async () => { await actions.unshareChannelFromAlliance(alliance.id, s.channel_id); await loadShared(); })}
                >
                  Unshare
                </button>
              </div>
            ))
          )}
          <div className="settings-row" style={{ gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
            <select value={toShare} onChange={(e) => setToShare(e.target.value)}>
              <option value="">Share a channel…</option>
              {shareableChannels.map(({ node, depth }) => (
                <option key={node.id} value={node.id}>
                  {"  ".repeat(depth)}{node.is_category ? "📁" : "#"} {node.name}
                </option>
              ))}
            </select>
            <button
              disabled={busy || !toShare}
              onClick={() => runGuard(async () => {
                await actions.shareChannelWithAlliance(alliance.id, toShare, !!selectedToShare?.is_category);
                setToShare("");
                await loadShared();
              })}
            >
              Share
            </button>
          </div>
          {selectedToShare?.is_category && (
            <p className="muted" style={{ fontSize: "var(--text-xs)" }}>{t("alliances.share.category_hint")}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function AlliancesSection({ activeHubUrl, channels, actions }: Props) {
  const [alliances, setAlliances] = useState<Alliance[] | null>(null);
  const [invites, setInvites] = useState<PendingAllianceInvite[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [a, i] = await Promise.all([actions.listAlliances(), actions.listPendingAllianceInvites()]);
      setAlliances(a);
      setInvites(i);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => { void load(); }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }

  function runGuard(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    fn().catch((e) => setError(errorMessage(e))).finally(() => setBusy(false));
  }

  function handleCreate() {
    const n = name.trim();
    if (!n) return;
    void run(async () => { await actions.createAlliance(n); setName(""); });
  }

  return (
    <section>
      <h1>Alliances</h1>
      <p className="muted">Alliances let hubs share channels. Create one, or accept an invite from another hub.</p>
      {error && alliances !== null && <p className="error-text">{error}</p>}

      <div className="settings-row" style={{ gap: "var(--space-2)" }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          placeholder="Alliance name"
          aria-label="Alliance name"
        />
        <button onClick={handleCreate} disabled={busy || !name.trim()}>Create alliance</button>
      </div>

      {invites.length > 0 && (
        <div className="settings-section">
          <label className="settings-label">Pending invites</label>
          {invites.map((inv) => (
            <div key={inv.id} className="settings-row" style={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <span>{inv.alliance_name} <span className="muted" style={{ fontSize: "var(--text-xs)" }}>from {inv.from_hub_name}</span></span>
              <span style={{ display: "flex", gap: "var(--space-2)" }}>
                <button className="btn-small" disabled={busy} onClick={() => run(() => actions.acceptAllianceInvite(inv.id, activeHubUrl))}>Accept</button>
                <button className="btn-small btn-secondary" disabled={busy} onClick={() => run(() => actions.declineAllianceInvite(inv.id))}>Decline</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="settings-section">
        <label className="settings-label">Your alliances</label>
        {alliances === null ? (
          error ? <ErrorRetry message={error} onRetry={load} /> : <p className="muted">Loading…</p>
        ) : alliances.length === 0 ? (
          <p className="muted">No alliances yet.</p>
        ) : (
          alliances.map((a) => (
            <AllianceRow
              key={a.id}
              alliance={a}
              myChannels={channels}
              busy={busy}
              onLeave={() => run(() => actions.leaveAlliance(a.id))}
              onError={setError}
              runGuard={runGuard}
              actions={actions}
            />
          ))
        )}
      </div>
    </section>
  );
}
