import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChannelRoleOverwrites, ChannelRolePermissions, ChannelPermissionsResponse, RoleInfo } from "../../types";
import { CHANNEL_OVERWRITE_PERMISSIONS, deriveRowStates, buildOverwritePayload, type TriState } from "../../utils/channelPermissions";

export interface ChannelPermissionsTabActions {
  getChannelPermissions: (channelId: string) => Promise<ChannelPermissionsResponse>;
  setChannelRolePermissions: (
    channelId: string,
    roleId: string,
    overwrites: ChannelRoleOverwrites,
  ) => Promise<ChannelRolePermissions>;
  clearChannelRolePermissions: (channelId: string, roleId: string) => Promise<void>;
  listRoles: () => Promise<RoleInfo[]>;
}

interface Props {
  channelId: string;
  actions: ChannelPermissionsTabActions;
  /** Highest priority among the viewer's own roles. The hub rejects edits
   * to overwrites of any role at or above this rank (even for the owner,
   * whose own builtin-owner row trips the >= guard) — those rows render
   * read-only instead of 403ing. */
  myMaxPriority?: number;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function ChannelPermissionsTab({ channelId, actions, myMaxPriority }: Props) {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<ChannelRolePermissions[] | null>(null);
  const [rolePriorities, setRolePriorities] = useState<Record<string, number> | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, TriState>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    actions
      .listRoles()
      .then((all) => {
        if (!cancelled) {
          setRolePriorities(Object.fromEntries(all.map((r) => [r.id, r.priority])));
        }
      })
      .catch(() => { /* priorities unknown — rows stay editable, hub still guards */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    actions
      .getChannelPermissions(channelId)
      .then((resp) => {
        if (cancelled) return;
        setRoles(resp.roles);
        setSelectedRoleId((prev) => prev ?? resp.roles[0]?.role_id ?? null);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const selectedRole = roles?.find((r) => r.role_id === selectedRoleId) ?? null;
  const selectedLocked =
    selectedRole !== null &&
    myMaxPriority !== undefined &&
    rolePriorities !== null &&
    (rolePriorities[selectedRole.role_id] ?? 0) >= myMaxPriority;

  useEffect(() => {
    if (selectedRole) setRows(deriveRowStates(selectedRole));
  }, [selectedRole?.role_id, selectedRole?.overwrites.allow.join(","), selectedRole?.overwrites.deny.join(",")]);

  function updateRoleInPlace(updated: ChannelRolePermissions) {
    setRoles((prev) => (prev ? prev.map((r) => (r.role_id === updated.role_id ? updated : r)) : prev));
  }

  async function handleSave() {
    if (!selectedRole) return;
    setSaving(true);
    setError(null);
    try {
      const payload = buildOverwritePayload(rows);
      const updated = await actions.setChannelRolePermissions(channelId, selectedRole.role_id, payload);
      updateRoleInPlace(updated);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!selectedRole) return;
    setSaving(true);
    setError(null);
    try {
      await actions.clearChannelRolePermissions(channelId, selectedRole.role_id);
      const resp = await actions.getChannelPermissions(channelId);
      setRoles(resp.roles);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted">{t("channel.permissions.loading")}</p>;

  return (
    <div>
      <p className="muted">{t("channel.permissions.hint")}</p>
      {error && <div className="error" style={{ marginBottom: "var(--space-2)" }}>{error}</div>}
      <div className="roles-layout">
        <div className="roles-list">
          {(roles ?? []).map((r) => (
            <button
              key={r.role_id}
              className={`role-list-item${selectedRoleId === r.role_id ? " active" : ""}`}
              onClick={() => setSelectedRoleId(r.role_id)}
            >
              <span className="role-list-name">{r.role_name}</span>
            </button>
          ))}
        </div>
        <div className="roles-panel">
          {selectedRole ? (
            <>
              {CHANNEL_OVERWRITE_PERMISSIONS.map((perm) => {
                const state = rows[perm.id] ?? "inherit";
                const inheritedAllow = selectedRole.inherited.includes(perm.id);
                const overridden = state !== "inherit";
                return (
                  <div
                    key={perm.id}
                    className="settings-row"
                    style={{ justifyContent: "space-between", alignItems: "center" }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {overridden && <span className="status-dot" style={{ background: "var(--accent)" }} />}
                      {perm.label}
                      {state === "inherit" && (
                        <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                          {inheritedAllow
                            ? t("channel.permissions.inherited_allow")
                            : t("channel.permissions.inherited_deny")}
                        </span>
                      )}
                    </span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        className={state === "inherit" ? "btn-primary" : "btn-secondary"}
                        disabled={selectedLocked}
                        onClick={() => setRows((prev) => ({ ...prev, [perm.id]: "inherit" }))}
                      >
                        {t("channel.permissions.inherit")}
                      </button>
                      <button
                        className={state === "allow" ? "btn-primary" : "btn-secondary"}
                        disabled={selectedLocked}
                        onClick={() => setRows((prev) => ({ ...prev, [perm.id]: "allow" }))}
                      >
                        {t("channel.permissions.allow")}
                      </button>
                      <button
                        className={state === "deny" ? "btn-primary" : "btn-secondary"}
                        disabled={selectedLocked}
                        onClick={() => setRows((prev) => ({ ...prev, [perm.id]: "deny" }))}
                      >
                        {t("channel.permissions.deny")}
                      </button>
                    </div>
                  </div>
                );
              })}
              {selectedLocked ? (
                <p className="muted" style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
                  {t("channel.permissions.locked_rank")}
                </p>
              ) : (
                <div className="modal-actions">
                  <button className="btn-secondary" onClick={handleReset} disabled={saving}>
                    {t("channel.permissions.reset")}
                  </button>
                  <button onClick={handleSave} disabled={saving}>
                    {saving ? t("modal.saving") : savedFlash ? t("channel.permissions.saved") : t("modal.save")}
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="muted">{t("channel.permissions.no_roles")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
