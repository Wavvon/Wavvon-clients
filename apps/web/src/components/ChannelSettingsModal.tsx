import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { FocusTrap } from "@wavvon/ui";
import type { Channel } from "@shared/types";
import { ChannelPermissionsTab } from "./ChannelPermissionsTab";
import { ChannelBansTab } from "./ChannelBansTab";
import { ColorSwatchPicker } from "./ColorSwatchPicker";
import { EmojiPicker } from "./EmojiPicker";
import { safeRoleColor } from "../utils/roleAppearance";

type Tab = "settings" | "permissions" | "bans";

interface Props {
  channel: Channel;
  saving: boolean;
  deleting: boolean;
  error: string | null;
  canManageRoles: boolean;
  /** Rename/appearance/delete are admin-only; a manage_roles-only member
   * opens straight into the Permissions tab and never sees the settings
   * form (the server rejects those actions for them anyway). */
  isAdmin: boolean;
  onSave: (name: string, description: string, color: string | null, icon: string | null) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ChannelSettingsModal({
  channel, saving, deleting, error, canManageRoles, isAdmin, onSave, onDelete, onClose,
}: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>(isAdmin ? "settings" : "permissions");
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description ?? "");
  const [color, setColor] = useState<string | null>(channel.color ?? null);
  const [icon, setIcon] = useState<string | null>(channel.icon ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty =
    name.trim() !== channel.name ||
    description.trim() !== (channel.description ?? "") ||
    color !== (channel.color ?? null) ||
    icon !== (channel.icon ?? null);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="channel-settings-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="channel-settings-title">
            {channel.is_category ? "Category Settings" : "Channel Settings"}
          </h3>

          {canManageRoles && (
            <div style={{ display: "flex", gap: 8, marginBottom: "var(--space-3)" }}>
              {isAdmin && (
                <button
                  className={tab === "settings" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setTab("settings")}
                >
                  {t("channel.settings.tab_settings")}
                </button>
              )}
              <button
                className={tab === "permissions" ? "btn-primary" : "btn-secondary"}
                onClick={() => setTab("permissions")}
              >
                {t("channel.settings.tab_permissions")}
              </button>
              {!channel.is_category && (
                <button
                  className={tab === "bans" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setTab("bans")}
                >
                  Bans
                </button>
              )}
            </div>
          )}

          {tab === "bans" && canManageRoles && !channel.is_category ? (
            <ChannelBansTab channelId={channel.id} />
          ) : (tab === "permissions" || !isAdmin) && canManageRoles ? (
            <ChannelPermissionsTab channelId={channel.id} />
          ) : (
            <>
              <label style={{ display: "block", marginBottom: "var(--space-2)" }}>
                <span className="label-text">Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
                  autoFocus
                  style={{ display: "block", width: "100%", marginTop: 4 }}
                />
              </label>

              {!channel.is_category && (
                <label style={{ display: "block", marginBottom: "var(--space-3)" }}>
                  <span className="label-text">Description (optional)</span>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
                    placeholder="What's this channel for?"
                    style={{ display: "block", width: "100%", marginTop: 4 }}
                  />
                </label>
              )}

              {/* Appearance (requires manage_channel_icons; server enforces). */}
              <div style={{ marginBottom: "var(--space-3)" }}>
                <span className="label-text">Appearance</span>
                <div className="settings-row" style={{ alignItems: "center", gap: "var(--space-2)", marginTop: 4 }}>
                  <span style={{ minWidth: 20, textAlign: "center" }}>{icon ?? "—"}</span>
                  <EmojiPicker onPick={setIcon} unicodeOnly />
                  {icon && (
                    <button type="button" className="btn-small btn-secondary" onClick={() => setIcon(null)}>
                      {t("modal.clear")}
                    </button>
                  )}
                  <span style={{ flex: 1 }} />
                  <span className="muted" style={{ fontSize: "var(--text-xs)" }}>Color</span>
                </div>
                <ColorSwatchPicker
                  value={color}
                  noColorLabel={t("hub.admin.role_categories.no_color")}
                  onChange={setColor}
                />
                {safeRoleColor(color) && (
                  <span aria-hidden="true" style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: safeRoleColor(color)!, marginTop: 4 }} />
                )}
              </div>

              <div className="modal-actions">
                <button onClick={onClose} className="btn-secondary">Cancel</button>
                <button
                  onClick={() => onSave(name.trim(), description.trim(), color, icon)}
                  disabled={saving || !name.trim() || !dirty}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>

              <hr style={{ margin: "var(--space-4) 0 var(--space-3)", border: "none", borderTop: "1px solid var(--border)" }} />

              {!confirmDelete ? (
                <button
                  className="btn-danger"
                  style={{ width: "100%" }}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete {channel.is_category ? "category" : "channel"}…
                </button>
              ) : (
                <div>
                  <p style={{ marginBottom: "var(--space-2)", color: "var(--danger)" }}>
                    This cannot be undone. Delete <strong>{channel.name}</strong>?
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </button>
                    <button className="btn-danger" style={{ flex: 1 }} disabled={deleting} onClick={onDelete}>
                      {deleting ? "Deleting…" : "Yes, delete"}
                    </button>
                  </div>
                </div>
              )}

              {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
            </>
          )}
        </div>
      </FocusTrap>
    </div>
  );
}
