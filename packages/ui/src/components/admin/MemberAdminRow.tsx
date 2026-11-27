import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey } from "@wavvon/core";
import type { MemberAdminInfo, User } from "../../types";
import { safeRoleColor } from "../../utils/roleAppearance";
import { Avatar } from "../Avatar";

interface Props {
  member: MemberAdminInfo;
  profile?: User;
  nameColor?: string;
  /** The line under the name: online, joined, muted. */
  status: string;
  open: boolean;
  onToggle: () => void;
  /** The roles editor, when the viewer may assign roles. */
  roles?: ReactNode;
  /** The moderation buttons. */
  actions: ReactNode;
}

/** One member in hub settings › People: who they are and their roles at a
 *  glance; "Manage" opens the roles, the actions and the full key. */
export function MemberAdminRow({ member, profile, nameColor, status, open, onToggle, roles, actions }: Props) {
  const { t } = useTranslation();
  const name = member.display_name || t("hub.admin.members.pending.no_name");
  const chips = member.roles.filter((r) => r.id !== "builtin-everyone");
  return (
    <li className={`member-admin-row${open ? " open" : ""}`}>
      <div className="member-admin-head">
        <span className="member-admin-avatar">
          <Avatar src={profile?.avatar} name={member.display_name} pubkey={member.public_key} size={34} />
          {profile?.online && <span className="member-admin-presence" aria-label={t("hub.admin.members.online")} />}
        </span>
        <span className="member-admin-who">
          <span className="member-admin-name-line">
            <span className="member-admin-name" style={nameColor ? { color: nameColor } : undefined}>{name}</span>
            <span className="member-pk" title={member.public_key}>{formatPubkey(member.public_key)}</span>
          </span>
          <span className="member-admin-meta">
            {!open && chips.map((r) => (
              <span key={r.id} className="member-role-chip">
                <span className="roles-dot" aria-hidden="true" style={{ background: safeRoleColor(r.color) ?? "var(--border-strong)" }} />
                {r.name}
              </span>
            ))}
            {!open && chips.length === 0 && <span>{t("hub.admin.members.state.no_roles")} ·</span>}
            <span>{status}</span>
          </span>
        </span>
        <button type="button" className="btn-secondary btn-small" aria-expanded={open} onClick={onToggle}>
          {open ? t("hub.admin.members.close") : t("hub.admin.members.manage")}
        </button>
      </div>
      {open && (
        <div className="member-admin-body">
          {roles && (
            <div className="member-admin-line">
              <span className="member-admin-label">{t("hub.admin.members.roles_label")}</span>
              {roles}
            </div>
          )}
          <div className="member-admin-line">
            <span className="member-admin-label">{t("hub.admin.members.actions_label")}</span>
            {actions}
          </div>
          <p className="member-admin-key">{member.public_key}</p>
        </div>
      )}
    </li>
  );
}
