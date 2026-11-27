import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MemberAdminInfo } from "../../types";
import { Avatar } from "../Avatar";

interface Props {
  roleId: string;
  members: MemberAdminInfo[];
  /** False when the role is at or above the viewer's own rank. */
  canEdit: boolean;
  onAdd: (member: MemberAdminInfo) => void;
  onRemove: (member: MemberAdminInfo) => void;
}

const nameOf = (m: MemberAdminInfo) => m.display_name || m.public_key.slice(0, 8);

export function RoleMembersTab({ roleId, members, canEdit, onAdd, onRemove }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const holders = members.filter((m) => m.roles.some((r) => r.id === roleId));
  const needle = query.trim().toLowerCase();
  const candidates = needle
    ? members.filter((m) => !holders.includes(m) && nameOf(m).toLowerCase().includes(needle)).slice(0, 8)
    : [];

  return (
    <div>
      {canEdit ? (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("hub.admin.roles.members_search")}
            aria-label={t("hub.admin.roles.members_search")}
          />
          {candidates.length > 0 && (
            <ul className="roles-list">
              {candidates.map((m) => (
                <li key={m.public_key} className="roles-member-row">
                  <Avatar name={m.display_name} pubkey={m.public_key} size={24} />
                  <span className="roles-row-name">{nameOf(m)}</span>
                  <button
                    type="button"
                    className="btn-small"
                    aria-label={t("hub.admin.roles.member_add_aria", { name: nameOf(m) })}
                    onClick={() => { onAdd(m); setQuery(""); }}
                  >
                    +
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="muted">{t("hub.admin.roles.members_locked")}</p>
      )}
      {holders.length === 0 && <p className="muted">{t("hub.admin.roles.members_empty")}</p>}
      <ul className="roles-list">
        {holders.map((m) => (
          <li key={m.public_key} className="roles-member-row">
            <Avatar name={m.display_name} pubkey={m.public_key} size={24} />
            <span className="roles-row-name">{nameOf(m)}</span>
            {canEdit && (
              <button
                type="button"
                className="btn-small btn-secondary"
                aria-label={t("hub.admin.roles.member_remove_aria", { name: nameOf(m) })}
                onClick={() => onRemove(m)}
              >
                {t("hub.admin.roles.member_remove")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
