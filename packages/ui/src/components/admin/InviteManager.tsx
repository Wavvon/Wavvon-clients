import { useEffect, useState } from "react";
import { formatRelativeSigned, buildInviteLink } from "@wavvon/core";
import type { InviteInfo, RoleInfo } from "../../types";
import { safeRoleColor } from "../../utils/roleAppearance";

// Mirrors hub/src/routes/invites.rs::ADMIN_GRANT_DEFAULT_EXPIRY_SECS — for
// client-side annotation only, the server remains authoritative and clamps
// independently of anything sent here.
const ADMIN_GRANT_DEFAULT_EXPIRY_SECS = 24 * 3600;

function roleGrantsAdmin(role: RoleInfo): boolean {
  return role.permissions.includes("admin");
}

function grantableRoles(roles: RoleInfo[], myMaxPriority: number): RoleInfo[] {
  return roles
    .filter((r) => r.id !== "builtin-everyone" && r.priority < myMaxPriority)
    .sort((a, b) => b.priority - a.priority);
}

function defaultInviteRoleOptions(roles: RoleInfo[]): RoleInfo[] {
  return roles
    .filter((r) => r.id !== "builtin-everyone" && !roleGrantsAdmin(r))
    .sort((a, b) => b.priority - a.priority);
}

export interface InviteManagerActions {
  listRoles: () => Promise<RoleInfo[]>;
  /** Default-invite-role prefill/save is a hub-settings round trip; both
   *  apps already expose a general hub-settings get/save pair. */
  getHubSettings: () => Promise<{ default_invite_role_id: string | null }>;
  saveHubSettings: (settings: { default_invite_role_id: string | null }) => Promise<void>;
}

interface Props {
  invites: InviteInfo[];
  activeHubUrl: string;
  /** This hub's stable serial (its public key) — embedded in invite links so a
   *  farm can route the same domain to different hubs. */
  hubSerial: string;
  /** Highest priority among the viewer's own roles; only lower-priority roles can be granted. */
  myMaxPriority: number;
  /** Gates the "Default role for new members" section — mirrors the Overview
   *  tab's own gating, since both read/write the same hub-settings surface. */
  isAdmin: boolean;
  onCreateInvite: (maxUses: number | null, expiresInSeconds: number | null, grantRoleId: string | null) => void;
  onRevokeInvite: (code: string) => void;
  actions: InviteManagerActions;
}

export function InviteManager(props: Props) {
  const { actions } = props;
  const [copiedInvite, setCopiedInvite] = useState<string | null>(null);
  const [inviteMaxUses, setInviteMaxUses] = useState("");
  const [inviteExpiry, setInviteExpiry] = useState("");
  const [grantRoleId, setGrantRoleId] = useState("");
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [defaultRoleId, setDefaultRoleId] = useState("");
  const [defaultRoleStatus, setDefaultRoleStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [defaultRoleError, setDefaultRoleError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    actions.listRoles().then((r) => { if (!cancelled) setRoles(r); }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!props.isAdmin) return;
    let cancelled = false;
    actions.getHubSettings()
      .then((s) => { if (!cancelled) setDefaultRoleId(s.default_invite_role_id ?? ""); })
      .catch(() => { /* prefill skipped */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.isAdmin]);

  const rolesById = new Map(roles.map((r) => [r.id, r]));

  // Same guard the hub enforces server-side (routes/invites.rs::create_invite):
  // can't mint an invite that grants a role at or above your own priority.
  // Mirrored here purely for a usable picker — the server remains authoritative.
  const grantableRoleOptions = grantableRoles(roles, props.myMaxPriority);
  const defaultRoleOptions = defaultInviteRoleOptions(roles);

  function expiryLabel(expiresAt: number): string | null {
    const rel = formatRelativeSigned(expiresAt);
    if (!rel) return null;
    return rel.future ? `Expires in ${rel.duration}` : `Expired ${rel.duration} ago`;
  }

  const selectedRole = grantRoleId ? rolesById.get(grantRoleId) : undefined;
  const forcesSingleUse = selectedRole ? roleGrantsAdmin(selectedRole) : false;

  function handleCreate() {
    props.onCreateInvite(
      forcesSingleUse ? 1 : (inviteMaxUses ? Number(inviteMaxUses) : null),
      forcesSingleUse ? ADMIN_GRANT_DEFAULT_EXPIRY_SECS : (inviteExpiry ? Number(inviteExpiry) : null),
      grantRoleId || null,
    );
  }

  async function handleSaveDefaultRole() {
    setDefaultRoleStatus("saving");
    setDefaultRoleError(null);
    try {
      // Server convention: "" clears the default, omitting the key leaves it
      // unchanged — and JSON null deserializes as omitted, so null would
      // silently no-op instead of clearing.
      await actions.saveHubSettings({ default_invite_role_id: defaultRoleId });
      setDefaultRoleStatus("saved");
      setTimeout(() => setDefaultRoleStatus("idle"), 2000);
    } catch (e) {
      setDefaultRoleError(String(e));
      setDefaultRoleStatus("error");
    }
  }

  return (
    <section>
      <h1>Invites</h1>
      {props.isAdmin && (
        <div className="settings-section">
          <label className="settings-label">Default role for new members</label>
          <p className="muted">Applied when an invite doesn't itself grant a role.</p>
          <div className="settings-row">
            <select value={defaultRoleId} onChange={(e) => setDefaultRoleId(e.target.value)}>
              <option value="">None (@everyone only)</option>
              {defaultRoleOptions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <button onClick={handleSaveDefaultRole} disabled={defaultRoleStatus === "saving"}>
              Save
            </button>
            {defaultRoleStatus === "saved" && <span className="muted" style={{ color: "var(--success)" }}>Saved</span>}
          </div>
          {defaultRoleError && <p className="error-text">{defaultRoleError}</p>}
        </div>
      )}
      <div className="settings-section">
        <label className="settings-label">Create invite</label>
        <div className="settings-row">
          <input
            type="number"
            placeholder="Max uses"
            value={forcesSingleUse ? "1" : inviteMaxUses}
            disabled={forcesSingleUse}
            onChange={(e) => setInviteMaxUses(e.target.value)}
            style={{ width: 180 }}
          />
          <input
            type="number"
            placeholder="Expires in seconds"
            value={forcesSingleUse ? String(ADMIN_GRANT_DEFAULT_EXPIRY_SECS) : inviteExpiry}
            disabled={forcesSingleUse}
            onChange={(e) => setInviteExpiry(e.target.value)}
            style={{ width: 220 }}
          />
          <select
            value={grantRoleId}
            onChange={(e) => setGrantRoleId(e.target.value)}
            title="Grant a role on redemption"
          >
            <option value="">No role grant</option>
            {grantableRoleOptions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <button onClick={handleCreate}>
            Create invite
          </button>
        </div>
        {forcesSingleUse && (
          <p className="muted">This role grants admin — the invite is forced to single-use with a 24h expiry.</p>
        )}
      </div>
      {props.invites.map((inv) => {
        const link = buildInviteLink(props.activeHubUrl, props.hubSerial, inv.code);
        const grantedRole = inv.grant_role_id ? rolesById.get(inv.grant_role_id) : undefined;
        const grantedRoleColor = grantedRole ? safeRoleColor(grantedRole.color) : null;
        return (
          <div key={inv.code} className="settings-row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
            <code className="pubkey-display" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }} title={link}>{link}</code>
            <button
              className="btn-secondary"
              onClick={() => { navigator.clipboard.writeText(link).catch(() => {}); setCopiedInvite(inv.code); setTimeout(() => setCopiedInvite(null), 2000); }}
            >
              {copiedInvite === inv.code ? "Copied" : "Copy"}
            </button>
            {inv.grant_role_id && (
              <span className="role-chip" style={grantedRoleColor ? { borderColor: grantedRoleColor, color: grantedRoleColor } : undefined}>
                {grantedRole?.name ?? inv.grant_role_id}
              </span>
            )}
            <span className="muted">
              {inv.uses}/{inv.max_uses ?? "∞"} uses
              {inv.expires_at ? ` · ${expiryLabel(inv.expires_at)}` : ""}
            </span>
            <button className="btn-secondary danger" onClick={() => props.onRevokeInvite(inv.code)}>Revoke</button>
          </div>
        );
      })}
    </section>
  );
}
