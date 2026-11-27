import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MemberAdminInfo, RoleCategory, RoleInfo } from "../../types";
import type { PermissionCatalogueEntry } from "../../utils/channelPermissions";
import { ErrorRetry } from "../ErrorRetry";
import { RoleCategoryManager, type RoleCategoryManagerActions } from "./RoleCategoryManager";
import { useConfirm } from "../ConfirmDialog";
import { RoleEditor } from "./RoleEditor";
import { RoleListPane } from "./RoleListPane";
import { effectiveDraft, type RoleDraft } from "./roleDraft";

/** Permission ids, in display order. Each label is the catalog key
 *  `hub.admin.roles.perm.<id>`, so a new permission is one id here plus one
 *  key in the four catalogs. */
/** Permission ids this build ships a label for.
 *
 * **Not the catalogue.** The hub owns that and serves it at `GET /permissions`
 * (capability `permissions.catalogue`), because four hand-maintained copies is
 * how six enforced permissions ended up missing from this screen and four that
 * gated nothing ended up on it.
 *
 * What stays here is the set this client can *name*. A hub newer than this
 * build can send an id with no label, and the screen shows the id rather than
 * hiding a permission that exists — being multi-hub, that is a normal state
 * and not an error.
 *
 * It is **not** the fallback either. A hub too old to serve a catalogue is on
 * the snake_case ids, which share no spelling with these, so offering them
 * would be checkboxes that hub refuses: the screen shows nothing to tick, plus
 * whatever each role already holds so an existing grant can still be removed.
 *
 * Nothing renders from this array. It exists so `templateLabels` can prove the
 * four catalogs name the same set.
 */
export const ALL_PERMISSIONS: string[] = [
  "messages.read",
  "messages.send",
  "messages.manage",
  "forum.posts.create",
  "forum.posts.manage",
  "channels.manage",
  "channels.appearance",
  "channels.permissions",
  "voice.join",
  "voice.screen_share",
  "voice.camera",
  "voice.soundboard.use",
  "voice.soundboard.manage",
  "voice.move_members",
  "voice.stage",
  "moderation.kick",
  "moderation.mute",
  "moderation.timeout",
  "moderation.ban.temporary",
  "moderation.ban.permanent",
  "moderation.reports.read",
  "moderation.reports.review",
  "moderation.settings",
  "banlist.read",
  "banlist.sources.manage",
  "banlist.overrides",
  "banlist.settings",
  "roles.manage",
  "members.read",
  "hub.settings",
  "hub.appearance",
  "hub.admission",
  "invites.manage",
  "events.create",
  "events.manage",
  "certs.issue",
  "certs.revoke",
  "certs.settings",
  "badges.manage",
  "alliances.manage",
  "directory.publish",
  "webhooks.incoming.manage",
  "webhooks.outgoing.manage",
  "apps.register",
  "audit.read",
  "surveys.manage",
  "surveys.responses.read",
  "stickers.packs.manage",
  "stickers.external",
  "stickers.moderate",
];


/** What the editor for one role offers: the hub's catalogue, plus whatever
 *  that role already holds. The second half matters on a hub that serves no
 *  catalogue — without it the editor is empty and an existing grant cannot
 *  even be taken away. Order is the catalogue's, extras last. */
export function roleEditorIds(catalogueIds: string[], rolePermissions: string[]): string[] {
  return [...catalogueIds, ...rolePermissions.filter((p) => !catalogueIds.includes(p))];
}

export interface RoleUpdateInput {
  name?: string;
  permissions?: string[];
  priority?: number;
  display_separately?: boolean;
  color?: string | null;
  icon?: string | null;
  category_id?: string | null;
}

export interface RolesSectionActions extends Partial<RoleCategoryManagerActions> {
  listRoles: () => Promise<RoleInfo[]>;
  createRole: (input: {
    name: string;
    permissions: string[];
    priority: number;
    display_separately: boolean;
  }) => Promise<RoleInfo>;
  updateRole: (roleId: string, updates: RoleUpdateInput) => Promise<RoleInfo>;
  deleteRole: (roleId: string) => Promise<void>;
  /** Category listing/CRUD and per-role color/icon/category are a known
   *  desktop Tauri-command gap (docs/docs/client-parity.md) — omitted
   *  entirely there until those commands exist. */
  listRoleCategories?: () => Promise<RoleCategory[]>;
  /** The hub's own permission catalogue, which is what this screen offers.
   *  Absent, or rejected, means the hub serves none — it is on the older
   *  snake_case ids, which share no spelling with the ones this build knows,
   *  so there is nothing to offer and the list renders empty rather than
   *  checkboxes the hub would refuse. Same shape as
   *  `ChannelPermissionsTabActions`. */
  listPermissionCatalogue?: () => Promise<PermissionCatalogueEntry[]>;
  /** `PUT /roles/order`, highest first; present only on a hub advertising
   *  `roles.order`. Returns every role in its new place. */
  reorderRoles?: (roleIdsHighestFirst: string[]) => Promise<RoleInfo[]>;
  /** The hub orders `everyone` like any other role (`roles.order.everyone`). */
  everyoneMovable?: boolean;
  /** Members tab of a role. Both absent means the tab is not offered. */
  assignRoleToUser?: (pubkey: string, roleId: string) => Promise<void>;
  removeRoleFromUser?: (pubkey: string, roleId: string) => Promise<void>;
}

interface Props {
  actions: RolesSectionActions;
  /** The caller's highest role priority: roles at or above it cannot move. */
  myMaxPriority?: number;
  /** The hub members with their roles: feeds member counts and the Members tab. */
  members?: MemberAdminInfo[];
  onMemberRolesChanged?: (publicKey: string, roles: RoleInfo[]) => void;
}

const isBuiltin = (role: RoleInfo) => role.id.startsWith("builtin-");

export function RolesSection({ actions, myMaxPriority, members, onMemberRolesChanged }: Props) {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  const [roles, setRoles] = useState<RoleInfo[] | null>(null);
  const [categories, setCategories] = useState<RoleCategory[]>([]);
  // What this screen offers to tick comes from the hub, not from ALL_PERMISSIONS:
  // a hub newer than this build enforces ids this build has never heard of.
  const [catalogue, setCatalogue] = useState<PermissionCatalogueEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RoleDraft>>({});
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);

  const supportsCategories = !!(
    actions.listRoleCategories && actions.createRoleCategory && actions.updateRoleCategory && actions.deleteRoleCategory
  );

  async function load() {
    setError(null);
    try {
      const [r, c] = await Promise.all([
        actions.listRoles(),
        actions.listRoleCategories ? actions.listRoleCategories() : Promise.resolve([]),
      ]);
      setRoles(r);
      setCategories(c);
      // The owner role is not listed: there is always exactly one and nothing to edit on it.
      setSelectedId((cur) => cur ?? r.filter((x) => x.id !== "builtin-owner").sort((a, b) => b.priority - a.priority)[0]?.id ?? null);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Its own effect: a hub that cannot serve a catalogue must leave the roles
  // readable rather than turning the screen into an error.
  useEffect(() => {
    let cancelled = false;
    const pending = actions.listPermissionCatalogue?.();
    if (!pending) return;
    pending
      .then((entries) => { if (!cancelled) setCatalogue(entries); })
      .catch(() => { /* hub too old to serve one: nothing to offer is the honest answer */ });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const replaceRole = (updated: RoleInfo) =>
    setRoles((prev) => (prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev));
  const dropDraft = (id: string) => setDrafts(({ [id]: _gone, ...rest }) => rest);

  async function guarded(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleCreate() {
    setCreating(true);
    await guarded(async () => {
      const created = await actions.createRole({
        name: t("hub.admin.roles.new_default"),
        permissions: [],
        priority: 1,
        display_separately: false,
      });
      setRoles((prev) => (prev ? [...prev, created] : [created]));
      setSelectedId(created.id);
      setJustCreated(created.id);
    });
    setCreating(false);
  }

  async function handleSave(role: RoleInfo) {
    setSaving(true);
    await guarded(async () => {
      replaceRole(await actions.updateRole(role.id, effectiveDraft(role, drafts[role.id])));
      dropDraft(role.id);
    });
    setSaving(false);
  }

  async function handleDelete(role: RoleInfo) {
    if (!(await confirm({
      title: t("hub.admin.roles.delete_confirm", { name: role.name }),
      confirmLabel: t("hub.admin.roles.delete"),
      danger: true,
    }))) return;
    await guarded(async () => {
      await actions.deleteRole(role.id);
      setRoles((prev) => (prev ? prev.filter((r) => r.id !== role.id) : prev));
      dropDraft(role.id);
      setSelectedId(null);
    });
  }

  async function changeMembership(role: RoleInfo, member: MemberAdminInfo, add: boolean) {
    await guarded(async () => {
      if (add) await actions.assignRoleToUser!(member.public_key, role.id);
      else await actions.removeRoleFromUser!(member.public_key, role.id);
      const next = add ? [...member.roles, role] : member.roles.filter((r) => r.id !== role.id);
      onMemberRolesChanged?.(member.public_key, next);
    });
  }

  if (roles === null) {
    if (error) {
      return (
        <section>
          <h1>{t("hub.admin.roles.title")}</h1>
          <ErrorRetry message={error} onRetry={load} />
        </section>
      );
    }
    return <p className="muted">{t("hub.admin.roles.loading")}</p>;
  }

  const counts = new Map<string, number>();
  for (const m of members ?? []) for (const r of m.roles) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
  if (members) counts.set("builtin-everyone", members.length);

  const selected = roles.find((r) => r.id === selectedId) ?? null;
  const canAssign = !!(members && actions.assignRoleToUser && actions.removeRoleFromUser);
  const catalogueIds = catalogue.map((e) => e.id);

  return (
    <section>
      <h1>{t("hub.admin.roles.title")}</h1>
      {dialog}
      {error && <p className="error-text">{error}</p>}
      <div className="roles-admin">
        <RoleListPane
          roles={roles}
          categories={categories}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onNew={() => void handleCreate()}
          creating={creating}
          onManageCategories={supportsCategories ? () => setManagingCategories(true) : undefined}
          reorder={
            actions.reorderRoles && myMaxPriority !== undefined
              ? {
                  myMaxPriority,
                  everyoneMovable: !!actions.everyoneMovable,
                  onReorder: (ids) => void guarded(async () => setRoles(await actions.reorderRoles!(ids))),
                }
              : undefined
          }
        />
        {selected ? (
          <RoleEditor
            key={selected.id}
            role={selected}
            memberCount={counts.get(selected.id) ?? 0}
            draft={drafts[selected.id]}
            onDraft={(patch) => setDrafts((d) => ({ ...d, [selected.id]: { ...d[selected.id], ...patch } }))}
            onSave={() => void handleSave(selected)}
            onUndo={() => dropDraft(selected.id)}
            saving={saving}
            onDelete={isBuiltin(selected) ? undefined : () => void handleDelete(selected)}
            initialTab={justCreated === selected.id ? "appearance" : undefined}
            permissionIds={roleEditorIds(catalogueIds, selected.permissions)}
            catalogue={catalogue}
            categories={categories}
            showAppearance={!isBuiltin(selected)}
            membersPanel={
              canAssign && selected.id !== "builtin-everyone"
                ? {
                    members: members!,
                    canEdit: myMaxPriority !== undefined && selected.priority < myMaxPriority,
                    onAdd: (m) => void changeMembership(selected, m, true),
                    onRemove: (m) => void changeMembership(selected, m, false),
                  }
                : undefined
            }
          />
        ) : (
          <p className="muted">{t("hub.admin.roles.select_hint")}</p>
        )}
      </div>
      {managingCategories && supportsCategories && (
        <RoleCategoryManager
          categories={categories}
          roleCounts={roles.reduce((m, r) => {
            if (r.id.startsWith("builtin-")) return m;
            const k = r.category_id ?? "";
            return m.set(k, (m.get(k) ?? 0) + 1);
          }, new Map<string, number>())}
          onChange={setCategories}
          onClose={() => setManagingCategories(false)}
          actions={{
            createRoleCategory: actions.createRoleCategory!,
            updateRoleCategory: actions.updateRoleCategory!,
            deleteRoleCategory: actions.deleteRoleCategory!,
          }}
        />
      )}
    </section>
  );
}
