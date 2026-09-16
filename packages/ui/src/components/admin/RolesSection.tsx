import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RoleCategory, RoleInfo } from "../../types";
import { groupRolesByCategory, roleTintStyle, safeRoleColor } from "../../utils/roleAppearance";
import { EmojiPicker } from "../content/EmojiPicker";
import { ErrorRetry } from "../ErrorRetry";
import { ColorSwatchPicker } from "./ColorSwatchPicker";
import { RoleCategoryManager, type RoleCategoryManagerActions } from "./RoleCategoryManager";

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
 * Also the fallback list for a hub too old to serve a catalogue, which has
 * none of these ids: it shows nothing to tick, which is the honest answer.
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
  "voice.soundboard.use",
  "voice.soundboard.manage",
  "voice.move_members",
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
  "alliances.peers",
  "directory.publish",
  "webhooks.incoming.manage",
  "webhooks.outgoing.manage",
  "bots.admit",
  "bots.capabilities",
  "bots.audit.read",
  "surveys.manage",
  "surveys.responses.read",
];


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
}

interface Props {
  actions: RolesSectionActions;
}

const isBuiltin = (role: RoleInfo) => role.id.startsWith("builtin-");

export function RolesSection({ actions }: Props) {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<RoleInfo[] | null>(null);
  const [categories, setCategories] = useState<RoleCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [permsOpenFor, setPermsOpenFor] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPriority, setNewPriority] = useState(1);
  const [newPerms, setNewPerms] = useState<Set<string>>(new Set());
  const [newHoist, setNewHoist] = useState(false);
  const [creating, setCreating] = useState(false);

  const supportsAppearance = !!(actions.listRoleCategories && actions.createRoleCategory && actions.updateRoleCategory && actions.deleteRoleCategory);

  async function load() {
    setError(null);
    try {
      const [r, c] = await Promise.all([
        actions.listRoles(),
        actions.listRoleCategories ? actions.listRoleCategories() : Promise.resolve([]),
      ]);
      setRoles(r);
      setCategories(c);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => { void load(); }, []);

  function replaceRole(updated: RoleInfo) {
    setRoles((prev) => (prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev));
  }

  async function applyUpdate(roleId: string, updates: RoleUpdateInput) {
    setError(null);
    try {
      const updated = await actions.updateRole(roleId, updates);
      replaceRole(updated);
    } catch (e) {
      setError(String(e));
    }
  }

  function toggleRolePerm(role: RoleInfo, perm: string) {
    const has = role.permissions.includes(perm);
    const next = has ? role.permissions.filter((p) => p !== perm) : [...role.permissions, perm];
    void applyUpdate(role.id, { permissions: next });
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const created = await actions.createRole({
        name,
        permissions: Array.from(newPerms),
        priority: newPriority,
        display_separately: newHoist,
      });
      setRoles((prev) => (prev ? [...prev, created] : [created]));
      setNewName("");
      setNewPriority(1);
      setNewPerms(new Set());
      setNewHoist(false);
      setShowCreate(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(role: RoleInfo) {
    if (!window.confirm(t("hub.admin.roles.delete_confirm", { name: role.name }))) return;
    setError(null);
    try {
      await actions.deleteRole(role.id);
      setRoles((prev) => (prev ? prev.filter((r) => r.id !== role.id) : prev));
    } catch (e) {
      setError(String(e));
    }
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

  const groups = groupRolesByCategory(roles, categories, { includeEmptyCategories: true });

  return (
    <section>
      <h1>{t("hub.admin.roles.title")}</h1>
      <p className="muted">{t("hub.admin.roles.hint")}</p>
      {error && <p className="error-text">{error}</p>}

      {!showCreate ? (
        <button type="button" onClick={() => setShowCreate(true)}>{t("hub.admin.roles.new")}</button>
      ) : (
        <div className="settings-section" style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "var(--space-3)" }}>
          <div className="settings-row" style={{ gap: "var(--space-2)" }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("hub.admin.roles.name_placeholder")}
              aria-label={t("hub.admin.roles.name_placeholder")}
              autoFocus
            />
            <input
              type="number"
              value={newPriority}
              onChange={(e) => setNewPriority(Number(e.target.value))}
              style={{ maxWidth: 90 }}
              title={t("hub.admin.roles.priority_title")}
              aria-label={t("hub.admin.roles.priority_aria")}
            />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", margin: "var(--space-2) 0" }}>
            {ALL_PERMISSIONS.map((perm) => (
              <label key={perm} className="checkbox-label" style={{ fontSize: "var(--text-sm)" }}>
                <input
                  type="checkbox"
                  checked={newPerms.has(perm)}
                  onChange={() => setNewPerms((prev) => {
                    const n = new Set(prev);
                    if (n.has(perm)) n.delete(perm); else n.add(perm);
                    return n;
                  })}
                />
                {t(`hub.admin.roles.perm.${perm}`)}
              </label>
            ))}
          </div>
          <label className="checkbox-label" style={{ fontSize: "var(--text-sm)" }}>
            <input type="checkbox" checked={newHoist} onChange={(e) => setNewHoist(e.target.checked)} />
            {t("hub.admin.roles.hoist")}
          </label>
          <div className="settings-row" style={{ marginTop: "var(--space-2)" }}>
            <button type="button" onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? t("hub.admin.roles.creating") : t("hub.admin.roles.create")}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)} disabled={creating}>
              {t("hub.admin.roles.cancel")}
            </button>
          </div>
        </div>
      )}

      {supportsAppearance && (
        <RoleCategoryManager
          categories={categories}
          onChange={setCategories}
          actions={{
            createRoleCategory: actions.createRoleCategory!,
            updateRoleCategory: actions.updateRoleCategory!,
            deleteRoleCategory: actions.deleteRoleCategory!,
          }}
        />
      )}

      {groups.map((group) => (
        <div key={group.category?.id ?? "uncategorized"} className="role-category-group">
          <div
            className={`role-category-header ${group.category?.color ? "role-category-header-tinted" : ""}`}
            style={roleTintStyle(group.category?.color)}
          >
            {group.category?.icon && <span>{group.category.icon}</span>}
            <span>{group.category?.name ?? t("hub.admin.roles.uncategorized")}</span>
          </div>

          {group.roles.length === 0 && (
            <p className="muted" style={{ marginLeft: "var(--space-2)" }}>{t("hub.admin.role_categories.category_empty")}</p>
          )}

          {group.roles.map((role) => (
            <div key={role.id}>
              <div className="settings-row" style={{ alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ minWidth: 20, textAlign: "center" }}>{role.icon ?? "—"}</span>
                <span style={{ minWidth: 140 }}>{role.name}</span>
                <span className="muted" style={{ fontSize: "var(--text-xs)", flex: 1 }}>
                  {role.permissions.join(", ") || "—"}
                </span>

                {/* Appearance (color/icon/category) is rejected server-side for
                    built-in roles, and the whole block requires the desktop
                    Tauri-command gap above to be closed first. */}
                {!isBuiltin(role) && supportsAppearance && (
                  <>
                    <select
                      value={role.category_id ?? ""}
                      onChange={(e) => applyUpdate(role.id, { category_id: e.target.value || null })}
                      title={t("hub.admin.roles.category_label")}
                    >
                      <option value="">{t("hub.admin.roles.category_none")}</option>
                      {categories
                        .slice()
                        .sort((a, b) => a.position - b.position)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>

                    <EmojiPicker onPick={(icon) => applyUpdate(role.id, { icon })} unicodeOnly />
                    {role.icon && (
                      <button
                        type="button"
                        className="btn-small btn-secondary"
                        onClick={() => applyUpdate(role.id, { icon: null })}
                      >
                        {t("hub.admin.roles.clear_icon")}
                      </button>
                    )}

                    <button
                      type="button"
                      className="color-swatch"
                      style={{
                        background: safeRoleColor(role.color) ?? "transparent",
                        border: safeRoleColor(role.color) ? undefined : "1px solid var(--border)",
                      }}
                      onClick={() => setColorPickerFor(colorPickerFor === role.id ? null : role.id)}
                      title={t("hub.admin.roles.color_label")}
                    />
                  </>
                )}

                {role.id !== "builtin-owner" && (
                  <button
                    type="button"
                    className="btn-small btn-secondary"
                    aria-expanded={permsOpenFor === role.id}
                    onClick={() => setPermsOpenFor(permsOpenFor === role.id ? null : role.id)}
                  >
                    {t("hub.admin.roles.permissions")} {permsOpenFor === role.id ? "▴" : "▾"}
                  </button>
                )}
                {!isBuiltin(role) && (
                  <button
                    type="button"
                    className="btn-small btn-secondary danger"
                    onClick={() => handleDelete(role)}
                  >
                    {t("hub.admin.roles.delete")}
                  </button>
                )}
              </div>

              {colorPickerFor === role.id && (
                <ColorSwatchPicker
                  value={role.color}
                  noColorLabel={t("hub.admin.roles.no_color")}
                  onChange={(color) => applyUpdate(role.id, { color })}
                />
              )}

              {permsOpenFor === role.id && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", padding: "var(--space-2) 0 var(--space-3) var(--space-4)" }}>
                  {ALL_PERMISSIONS.map((perm) => (
                    <label key={perm} className="checkbox-label" style={{ fontSize: "var(--text-sm)" }}>
                      <input
                        type="checkbox"
                        checked={role.permissions.includes(perm)}
                        onChange={() => toggleRolePerm(role, perm)}
                      />
                      {t(`hub.admin.roles.perm.${perm}`)}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
