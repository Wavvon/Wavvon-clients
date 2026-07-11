import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RoleInfo } from "@shared/types";
import { buildInviteLink } from "@wavvon/core";
import { listRoles, createInvite } from "@platform";
import { FocusTrap } from "@wavvon/ui";
import { grantableRoles, roleGrantsAdmin } from "@shared/utils/inviteRoles";

// Mirrors hub/src/routes/invites.rs::ADMIN_GRANT_DEFAULT_EXPIRY_SECS — for
// client-side annotation only, the server remains authoritative.
const ADMIN_GRANT_DEFAULT_EXPIRY_SECS = 24 * 3600;

interface Props {
  activeHubUrl: string;
  /** This hub's stable serial (its public key) — embedded in invite links so a
   *  farm can route the same domain to different hubs. */
  hubSerial: string;
  /** Highest priority among the viewer's own roles; only lower-priority roles can be granted. */
  myMaxPriority: number;
  onClose: () => void;
}

/** Compact invite-creation modal for members who can create invites
 *  (manage_channels) but aren't full admins — no access to the full admin
 *  panel. Mints a plain invite by default; offers a role picker only when
 *  the viewer actually has grantable roles below their own priority. */
export function QuickInviteModal(props: Props) {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [grantRoleId, setGrantRoleId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listRoles().then((r) => { if (!cancelled) setRoles(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const options = grantableRoles(roles, props.myMaxPriority);
  const selectedRole = options.find((r) => r.id === grantRoleId);
  const forcesSingleUse = selectedRole ? roleGrantsAdmin(selectedRole) : false;

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const inv = await createInvite(
        forcesSingleUse ? 1 : null,
        forcesSingleUse ? ADMIN_GRANT_DEFAULT_EXPIRY_SECS : null,
        grantRoleId || null,
      );
      setLink(buildInviteLink(props.activeHubUrl, props.hubSerial, inv.code));
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <FocusTrap>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="quick-invite-title" onClick={(e) => e.stopPropagation()}>
          <h3 id="quick-invite-title">{t("hub.invite_people")}</h3>
          {!link && (
            <>
              {options.length > 0 && (
                <div className="settings-section">
                  <label className="settings-label" htmlFor="quick-invite-role">{t("invites.create.grant_role_label")}</label>
                  <select id="quick-invite-role" value={grantRoleId} onChange={(e) => setGrantRoleId(e.target.value)}>
                    <option value="">{t("invites.quick.grant_role_default")}</option>
                    {options.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  {forcesSingleUse && <p className="muted">{t("invites.create.admin_grant_hint")}</p>}
                </div>
              )}
              {error && <p className="error-text">{error}</p>}
              <div className="modal-actions">
                <button onClick={props.onClose} className="btn-secondary">{t("modal.cancel")}</button>
                <button onClick={handleCreate} disabled={creating}>
                  {creating ? t("invites.quick.creating") : t("invites.quick.create")}
                </button>
              </div>
            </>
          )}
          {link && (
            <>
              <div className="settings-row">
                <code className="pubkey-display" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }} title={link}>{link}</code>
                <button
                  className="btn-secondary"
                  onClick={() => { navigator.clipboard.writeText(link).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                >
                  {copied ? t("modal.copied") : t("modal.copy")}
                </button>
              </div>
              <div className="modal-actions">
                <button onClick={props.onClose}>{t("modal.close")}</button>
              </div>
            </>
          )}
        </div>
      </FocusTrap>
    </div>
  );
}
