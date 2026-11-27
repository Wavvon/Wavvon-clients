import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MemberAdminInfo, RoleCategory, RoleInfo } from "../../types";
import type { PermissionCatalogueEntry } from "../../utils/channelPermissions";
import { safeRoleColor } from "../../utils/roleAppearance";
import { RoleAppearanceTab } from "./RoleAppearanceTab";
import { RoleMembersTab } from "./RoleMembersTab";
import { RolePermissionsTab } from "./RolePermissionsTab";
import { draftChangeCount, type RoleDraft } from "./roleDraft";

export type RoleTab = "permissions" | "appearance" | "members";

interface Props {
  role: RoleInfo;
  memberCount: number;
  draft: RoleDraft | undefined;
  onDraft: (patch: RoleDraft) => void;
  onSave: () => void;
  onUndo: () => void;
  saving: boolean;
  onDelete?: () => void;
  initialTab?: RoleTab;
  permissionIds: string[];
  catalogue: PermissionCatalogueEntry[];
  categories: RoleCategory[];
  showAppearance: boolean;
  /** Present when the app can list members and assign roles. */
  membersPanel?: {
    members: MemberAdminInfo[];
    canEdit: boolean;
    onAdd: (m: MemberAdminInfo) => void;
    onRemove: (m: MemberAdminInfo) => void;
  };
}

export function RoleEditor({
  role,
  memberCount,
  draft,
  onDraft,
  onSave,
  onUndo,
  saving,
  onDelete,
  initialTab,
  permissionIds,
  catalogue,
  categories,
  showAppearance,
  membersPanel,
}: Props) {
  const { t } = useTranslation();
  const isOwner = role.id === "builtin-owner";
  const [tab, setTab] = useState<RoleTab>(initialTab ?? "permissions");
  const name = draft?.name ?? role.name;
  const permissions = draft?.permissions ?? role.permissions;
  const color = safeRoleColor(draft?.color !== undefined ? draft.color : role.color);
  const changes = draftChangeCount(role, draft);
  const tabs: { id: RoleTab; label: string }[] = [
    { id: "permissions", label: t("hub.admin.roles.tab.permissions") },
    ...(showAppearance ? [{ id: "appearance" as const, label: t("hub.admin.roles.tab.appearance") }] : []),
    ...(membersPanel ? [{ id: "members" as const, label: t("hub.admin.roles.tab.members", { count: memberCount }) }] : []),
  ];

  return (
    <div className="roles-editor">
      <header className="roles-editor-header">
        <span className="roles-dot roles-dot-lg" aria-hidden="true" style={{ background: color ?? "var(--border)" }} />
        <div className="roles-editor-title">
          <h2>{name}</h2>
          <p className="muted">
            {isOwner
              ? `${t("hub.admin.roles.members_count", { count: memberCount })} · ${t("hub.admin.roles.all_permissions")}`
              : t("hub.admin.roles.summary", { members: memberCount, perms: permissions.length })}
          </p>
        </div>
        {onDelete && (
          <button type="button" className="btn-small danger" onClick={onDelete}>
            {t("hub.admin.roles.delete")}
          </button>
        )}
      </header>

      <div className="profile-tabs" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            className={`profile-tab${tab === x.id ? " active" : ""}`}
            onClick={() => setTab(x.id)}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className="roles-editor-body" role="tabpanel">
        {tab === "permissions" &&
          (isOwner ? (
            <>
              <p><strong>{t("hub.admin.roles.all_permissions")}</strong></p>
              <p className="muted">{t("hub.admin.roles.owner_note")}</p>
            </>
          ) : (
            <RolePermissionsTab
              ids={permissionIds}
              catalogue={catalogue}
              granted={permissions}
              onToggle={(perm) =>
                onDraft({
                  permissions: permissions.includes(perm) ? permissions.filter((p) => p !== perm) : [...permissions, perm],
                })
              }
            />
          ))}
        {tab === "appearance" && showAppearance && (
          <RoleAppearanceTab
            values={{
              name,
              color: draft?.color !== undefined ? draft.color : role.color,
              icon: draft?.icon !== undefined ? draft.icon : role.icon,
              category_id: draft?.category_id !== undefined ? draft.category_id : role.category_id,
              display_separately: draft?.display_separately ?? !!role.display_separately,
            }}
            categories={categories}
            onChange={onDraft}
          />
        )}
        {tab === "members" && membersPanel && <RoleMembersTab roleId={role.id} {...membersPanel} />}
      </div>

      {changes > 0 && (
        <div className="roles-savebar" role="status">
          <span>{t("hub.admin.roles.unsaved", { count: changes })}</span>
          <button type="button" className="btn-secondary" onClick={onUndo} disabled={saving}>
            {t("hub.admin.roles.undo")}
          </button>
          <button type="button" className="btn-primary" onClick={onSave} disabled={saving}>
            {saving ? t("modal.saving") : t("hub.admin.roles.save")}
          </button>
        </div>
      )}
    </div>
  );
}
