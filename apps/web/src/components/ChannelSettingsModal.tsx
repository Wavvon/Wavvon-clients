import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { FocusTrap } from "@wavvon/ui";
import type { Channel } from "@shared/types";
import { ChannelPermissionsTab } from "./ChannelPermissionsTab";
import { ChannelBansTab } from "./ChannelBansTab";
import { ColorSwatchPicker } from "./ColorSwatchPicker";
import { EmojiPicker } from "./EmojiPicker";
import { safeRoleColor } from "../utils/roleAppearance";
import { BANNER_MAX_BYTES, BANNER_MIME_TYPES, type BannerSource } from "./CreateChannelModal";
import { activeSession } from "@platform";

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
  /** Viewer's highest role priority — rows at/above it render read-only in
   * the Permissions tab (the hub rejects those edits). */
  myMaxPriority?: number;
  onSave: (name: string, description: string, color: string | null, icon: string | null, banner?: BannerSource) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ChannelSettingsModal({
  channel, saving, deleting, error, canManageRoles, isAdmin, myMaxPriority, onSave, onDelete, onClose,
}: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>(isAdmin ? "settings" : "permissions");
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description ?? "");
  const [color, setColor] = useState<string | null>(channel.color ?? null);
  const [icon, setIcon] = useState<string | null>(channel.icon ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isBanner = channel.channel_type === "banner";
  const [bannerSourceMode, setBannerSourceMode] = useState<"url" | "upload">(
    channel.banner_file_id ? "upload" : "url",
  );
  const [bannerUrl, setBannerUrl] = useState(channel.banner_url ?? "");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerFileError, setBannerFileError] = useState<string | null>(null);

  let hubUrl: string | undefined;
  try { hubUrl = activeSession().hub_url; } catch { /* no session — preview skipped */ }
  const currentBannerSrc = channel.banner_url
    ? channel.banner_url
    : channel.banner_file_id && hubUrl
      ? `${hubUrl}/uploads/${channel.banner_file_id}`
      : undefined;

  const bannerDirty =
    isBanner &&
    (bannerSourceMode === "upload"
      ? bannerFile !== null
      : bannerUrl.trim() !== (channel.banner_url ?? "") && bannerUrl.trim() !== "");

  function handlePickBannerFile(file: File | null) {
    setBannerFileError(null);
    if (!file) { setBannerFile(null); return; }
    if (!BANNER_MIME_TYPES.includes(file.type)) {
      setBannerFileError(t("channel.create.banner_bad_type"));
      setBannerFile(null);
      return;
    }
    if (file.size > BANNER_MAX_BYTES) {
      setBannerFileError(t("channel.create.banner_too_large"));
      setBannerFile(null);
      return;
    }
    setBannerFile(file);
  }

  const dirty =
    name.trim() !== channel.name ||
    description.trim() !== (channel.description ?? "") ||
    color !== (channel.color ?? null) ||
    icon !== (channel.icon ?? null) ||
    bannerDirty;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
        <div
          className="modal modal-tabbed"
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
            <ChannelPermissionsTab channelId={channel.id} myMaxPriority={myMaxPriority} />
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

              {isBanner && (
                <div style={{ marginBottom: "var(--space-3)" }}>
                  <span className="label-text">{t("channel.create.banner_source_label")}</span>
                  {currentBannerSrc && (
                    <img
                      src={currentBannerSrc}
                      alt=""
                      style={{ width: "100%", height: "auto", display: "block", borderRadius: 4, margin: "4px 0" }}
                    />
                  )}
                  <div style={{ display: "flex", gap: 8, margin: "4px 0 8px" }}>
                    {(["url", "upload"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={bannerSourceMode === mode ? "btn-small" : "btn-small btn-secondary"}
                        aria-pressed={bannerSourceMode === mode}
                        onClick={() => setBannerSourceMode(mode)}
                      >
                        {mode === "url" ? t("channel.create.banner_source_url") : t("channel.create.banner_source_upload")}
                      </button>
                    ))}
                  </div>
                  {bannerSourceMode === "url" ? (
                    <input
                      type="text"
                      value={bannerUrl}
                      onChange={(e) => setBannerUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
                      placeholder="https://example.com/banner.png"
                      style={{ display: "block", width: "100%" }}
                    />
                  ) : (
                    <>
                      <input
                        type="file"
                        accept={BANNER_MIME_TYPES.join(",")}
                        onChange={(e) => handlePickBannerFile(e.target.files?.[0] ?? null)}
                        style={{ display: "block", width: "100%" }}
                      />
                      {bannerFile && (
                        <span className="muted" style={{ fontSize: "var(--text-xs)" }}>{bannerFile.name}</span>
                      )}
                      {bannerFileError && (
                        <span style={{ color: "var(--danger)", fontSize: "var(--text-xs)", display: "block" }}>{bannerFileError}</span>
                      )}
                    </>
                  )}
                  <span className="muted" style={{ fontSize: "var(--text-xs)", display: "block", marginTop: 4 }}>
                    {t("channel.create.banner_hint")}
                  </span>
                </div>
              )}

              {/* Appearance (requires manage_channel_icons; server enforces). */}
              <div style={{ marginBottom: "var(--space-3)" }}>
                <span className="label-text">Appearance</span>
                <div className="settings-row" style={{ alignItems: "center", gap: "var(--space-2)", marginTop: 4 }}>
                  {/* Currently chosen channel icon; empty (width kept) when none. */}
                  <span style={{ minWidth: 20, textAlign: "center" }}>{icon ?? ""}</span>
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

              {/* One footer row: destructive action on the left, Cancel/Save
                  on the right. Confirming delete swaps the row in place. */}
              <div className="modal-actions" style={{ alignItems: "center" }}>
                {confirmDelete ? (
                  <>
                    <span style={{ marginRight: "auto", color: "var(--danger)", fontSize: "var(--text-sm)" }}>
                      Delete <strong>{channel.name}</strong>? This cannot be undone.
                    </span>
                    <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </button>
                    <button className="btn-danger" disabled={deleting} onClick={onDelete}>
                      {deleting ? "Deleting…" : "Yes, delete"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn-danger"
                      style={{ marginRight: "auto" }}
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete {channel.is_category ? "category" : "channel"}…
                    </button>
                    <button onClick={onClose} className="btn-secondary">Cancel</button>
                    <button
                      onClick={() =>
                        onSave(
                          name.trim(),
                          description.trim(),
                          color,
                          icon,
                          bannerDirty
                            ? bannerSourceMode === "url"
                              ? { url: bannerUrl.trim() }
                              : { file: bannerFile }
                            : undefined,
                        )
                      }
                      disabled={saving || !name.trim() || !dirty}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </>
                )}
              </div>

              {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
            </>
          )}
        </div>
      </FocusTrap>
    </div>
  );
}
