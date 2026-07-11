import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InviteInfo, RoleInfo } from "@shared/types";
import { formatRelativeSigned, buildInviteLink } from "@wavvon/core";
import { listRoles } from "@platform";
import { safeRoleColor } from "@shared/utils/roleAppearance";

// Mirrors hub/src/routes/invites.rs::ADMIN_GRANT_DEFAULT_EXPIRY_SECS — for
// client-side annotation only, the server remains authoritative and clamps
// independently of anything sent here.
const ADMIN_GRANT_DEFAULT_EXPIRY_SECS = 24 * 3600;

interface Props {
  invites: InviteInfo[];
  activeHubUrl: string;
  /** This hub's stable serial (its public key) — embedded in invite links so a
   *  farm can route the same domain to different hubs. */
  hubSerial: string;
  /** Highest priority among the viewer's own roles; only lower-priority roles can be granted. */
  myMaxPriority: number;
  onCreateInvite: (maxUses: number | null, expiresInSeconds: number | null, grantRoleId: string | null) => void;
  onRevokeInvite: (code: string) => void;
}

export function InviteManager(props: Props) {
  const { t } = useTranslation();
  const [copiedInvite, setCopiedInvite] = useState<string | null>(null);
  const [inviteMaxUses, setInviteMaxUses] = useState("");
  const [inviteExpiry, setInviteExpiry] = useState("");
  const [grantRoleId, setGrantRoleId] = useState("");
  const [roles, setRoles] = useState<RoleInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    listRoles().then((r) => { if (!cancelled) setRoles(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const rolesById = new Map(roles.map((r) => [r.id, r]));

  // Same guard the hub enforces server-side (routes/invites.rs::create_invite):
  // can't mint an invite that grants a role at or above your own priority.
  // Mirrored here purely for a usable picker — the server remains authoritative.
  const grantableRoles = roles
    .filter((r) => r.id !== "builtin-everyone" && r.priority < props.myMaxPriority)
    .sort((a, b) => b.priority - a.priority);

  function expiryLabel(expiresAt: number): string | null {
    const rel = formatRelativeSigned(expiresAt);
    if (!rel) return null;
    return rel.future
      ? t("admin.invite.expires_in", { duration: rel.duration })
      : t("admin.invite.expired_ago", { duration: rel.duration });
  }

  const selectedRole = grantRoleId ? rolesById.get(grantRoleId) : undefined;
  // Mirrors role_grants_admin: builtin-owner carries an explicit "admin" row too.
  const forcesSingleUse = selectedRole?.permissions.includes("admin") ?? false;

  function handleCreate() {
    props.onCreateInvite(
      forcesSingleUse ? 1 : (inviteMaxUses ? Number(inviteMaxUses) : null),
      forcesSingleUse ? ADMIN_GRANT_DEFAULT_EXPIRY_SECS : (inviteExpiry ? Number(inviteExpiry) : null),
      grantRoleId || null,
    );
  }

  return (
    <section>
      <h1>{t("hub.admin.tabs.invites")}</h1>
      <div className="settings-section">
        <label className="settings-label">{t("invites.create.title")}</label>
        <div className="settings-row">
          <input
            type="number"
            placeholder={t("invites.create.max_uses_placeholder")}
            value={forcesSingleUse ? "1" : inviteMaxUses}
            disabled={forcesSingleUse}
            onChange={(e) => setInviteMaxUses(e.target.value)}
            style={{ width: 180 }}
          />
          <input
            type="number"
            placeholder={t("admin.invite.expires_placeholder")}
            value={forcesSingleUse ? String(ADMIN_GRANT_DEFAULT_EXPIRY_SECS) : inviteExpiry}
            disabled={forcesSingleUse}
            onChange={(e) => setInviteExpiry(e.target.value)}
            style={{ width: 220 }}
          />
          <select
            value={grantRoleId}
            onChange={(e) => setGrantRoleId(e.target.value)}
            title={t("invites.create.grant_role_label")}
          >
            <option value="">{t("invites.create.grant_role_none")}</option>
            {grantableRoles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <button onClick={handleCreate}>
            {t("invites.create.button")}
          </button>
        </div>
        {forcesSingleUse && (
          <p className="muted">{t("invites.create.admin_grant_hint")}</p>
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
              {copiedInvite === inv.code ? t("modal.copied") : t("modal.copy")}
            </button>
            {inv.grant_role_id && (
              <span className="role-chip" style={grantedRoleColor ? { borderColor: grantedRoleColor, color: grantedRoleColor } : undefined}>
                {grantedRole?.name ?? inv.grant_role_id}
              </span>
            )}
            <span className="muted">
              {inv.uses}/{inv.max_uses ?? "∞"} {t("admin.invite.uses_label")}
              {inv.expires_at ? ` · ${expiryLabel(inv.expires_at)}` : ""}
            </span>
            <button className="btn-secondary danger" onClick={() => props.onRevokeInvite(inv.code)}>{t("invites.revoke")}</button>
          </div>
        );
      })}
    </section>
  );
}
