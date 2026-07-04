import { useEffect, useState } from "react";
import {
  listAlliances, createAlliance, leaveAlliance,
  listPendingAllianceInvites, acceptAllianceInvite, declineAllianceInvite,
} from "@platform";
import type { Alliance, PendingAllianceInvite } from "@platform";
import { HubApiError } from "../platform/http";

interface Props {
  activeHubUrl: string;
}

export function AlliancesSection({ activeHubUrl }: Props) {
  const [alliances, setAlliances] = useState<Alliance[] | null>(null);
  const [invites, setInvites] = useState<PendingAllianceInvite[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [a, i] = await Promise.all([listAlliances(), listPendingAllianceInvites()]);
      setAlliances(a);
      setInvites(i);
    } catch (e) {
      setError(e instanceof HubApiError ? e.message : String(e));
    }
  }

  useEffect(() => { void load(); }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); }
    catch (e) { setError(e instanceof HubApiError ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  function handleCreate() {
    const n = name.trim();
    if (!n) return;
    void run(async () => { await createAlliance(n); setName(""); });
  }

  return (
    <section>
      <h1>Alliances</h1>
      <p className="muted">Alliances let hubs share channels. Create one, or accept an invite from another hub.</p>
      {error && <p className="error-text">{error}</p>}

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
                <button className="btn-small" disabled={busy} onClick={() => run(() => acceptAllianceInvite(inv.id, activeHubUrl).then(() => {}))}>Accept</button>
                <button className="btn-small btn-secondary" disabled={busy} onClick={() => run(() => declineAllianceInvite(inv.id))}>Decline</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="settings-section">
        <label className="settings-label">Your alliances</label>
        {alliances === null ? (
          <p className="muted">Loading…</p>
        ) : alliances.length === 0 ? (
          <p className="muted">No alliances yet.</p>
        ) : (
          alliances.map((a) => (
            <div key={a.id} className="settings-row" style={{ alignItems: "center", justifyContent: "space-between" }}>
              <span>{a.name}</span>
              <button className="btn-small btn-secondary danger" disabled={busy} onClick={() => run(() => leaveAlliance(a.id))}>Leave</button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
