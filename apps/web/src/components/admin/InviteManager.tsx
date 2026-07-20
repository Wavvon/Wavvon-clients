import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InviteInfo, RoleInfo } from "@shared/types";
import { formatRelativeSigned, buildInviteLink } from "@wavvon/core";
import { listRoles, getHubSettings, saveHubSettings } from "@platform";
import { HubApiError } from "../../platform/http";
import { safeRoleColor } from "@wavvon/ui";
import { grantableRoles, roleGrantsAdmin, defaultInviteRoleOptions } from "@shared/utils/inviteRoles";

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
  /** Gates the "Default role for new members" section — mirrors the Overview
   *  tab's own gating, since both read/write the same hub-settings surface. */
  isAdmin: boolean;
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
  const [defaultRoleId, setDefaultRoleId] = useState("");
  const [defaultRoleStatus, setDefaultRoleStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [defaultRoleError, setDefaultRoleError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listRoles().then((r) => { if (!cancelled) setRoles(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!props.isAdmin) return;
    let cancelled = false;
    getHubSettings()
      .then((s) => { if (!cancelled) setDefaultRoleId(s.default_invite_role_id ?? ""); })
      .catch(() => { /* prefill skipped */ });
    return () => { cancelled = true; };
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
    return rel.future
      ? t("admin.invite.expires_in", { duration: rel.duration })
      : t("admin.invite.expired_ago", { duration: rel.duration });
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
      // Server convention (PATCH /hub): "" clears the default, omitting the
      // key leaves it unchanged — and JSON null deserializes as omitted, so
      // null would silently no-op instead of clearing.
      await saveHubSettings({ default_invite_role_id: defaultRoleId });
      setDefaultRoleStatus("saved");
      setTimeout(() => setDefaultRoleStatus("idle"), 2000);
    } catch (e) {
      setDefaultRoleError(e instanceof HubApiError ? e.message : String(e));
      setDefaultRoleStatus("error");
    }
  }

  return (
    <section>
      <h1>{t("hub.admin.tabs.invites")}</h1>
      {props.isAdmin && (
        <div className="settings-section">
          <label className="settings-label">{t("invites.default_role.title")}</label>
          <p className="muted">{t("invites.default_role.hint")}</p>
          <div className="settings-row">
            <select value={defaultRoleId} onChange={(e) => setDefaultRoleId(e.target.value)}>
              <option value="">{t("invites.default_role.none")}</option>
              {defaultRoleOptions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <button onClick={handleSaveDefaultRole} disabled={defaultRoleStatus === "saving"}>
              {t("invites.default_role.save")}
            </button>
            {defaultRoleStatus === "saved" && <span className="muted" style={{ color: "var(--success)" }}>{t("invites.default_role.saved")}</span>}
          </div>
          {defaultRoleError && <p className="error-text">{defaultRoleError}</p>}
        </div>
      )}
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
            {grantableRoleOptions.map((r) => (
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
