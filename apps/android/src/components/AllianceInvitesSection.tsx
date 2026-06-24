import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PendingAllianceInvite } from "../types";
import { formatRelative } from "@voxply/core";

export function AllianceInvitesSection({ ownHubUrl }: { ownHubUrl: string }) {
  const [invites, setInvites] = useState<PendingAllianceInvite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState<string | null>(null);

  async function load() {
    try {
      const list = await invoke<PendingAllianceInvite[]>("list_pending_alliance_invites");
      setInvites(list);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => { load(); }, []);

  async function respond(id: string, accept: boolean) {
    setResponding(id);
    try {
      await invoke("respond_to_alliance_invite", {
        inviteId: id,
        accept,
        ownHubUrl: accept ? ownHubUrl : undefined,
      });
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setResponding(null);
    }
  }

  return (
    <section>
      <h1>Alliance Invites</h1>
      <p className="muted">
        Incoming alliance invitations from other hubs. Accept to join the
        alliance and start sharing channels, or decline to remove the request.
      </p>

      {error && (
        <div className="error-banner" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {error}
          <button className="btn-icon-small" onClick={() => setError(null)} aria-label="Dismiss" title="Dismiss">×</button>
        </div>
      )}

      {invites.length === 0 ? (
        <div className="alliance-invites-empty">
          <p className="muted">No pending alliance invitations.</p>
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
            When another hub sends your hub an alliance invite, it will appear
            here for you to accept or decline.
          </p>
        </div>
      ) : (
        <div className="alliance-invites-list">
          {invites.map((inv) => (
            <div key={inv.id} className="alliance-invite-card">
              <div className="alliance-invite-card-header">
                <div className="alliance-invite-card-name">{inv.alliance_name}</div>
                <div className="alliance-invite-card-meta muted">
                  from <strong>{inv.from_hub_name}</strong>
                  <span className="alliance-invite-card-url"> · {inv.from_hub_url}</span>
                </div>
              </div>

              {inv.message && (
                <div className="alliance-invite-card-message">
                  "{inv.message}"
                </div>
              )}

              <div className="alliance-invite-card-footer">
                <span className="muted alliance-invite-card-date">
                  {formatRelative(inv.created_at)}
                </span>
                <div className="alliance-invite-card-actions">
                  <button
                    className="btn-accept"
                    onClick={() => respond(inv.id, true)}
                    disabled={responding === inv.id}
                  >
                    ✓ Accept
                  </button>
                  <button
                    className="btn-decline"
                    onClick={() => respond(inv.id, false)}
                    disabled={responding === inv.id}
                  >
                    ✕ Decline
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
