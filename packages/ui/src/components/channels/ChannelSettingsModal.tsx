import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FocusTrap } from "../FocusTrap";
import { EmojiPicker } from "../content/EmojiPicker";
import { ChannelIcon } from "../Icons";
import { safeRoleColor } from "../../utils/roleAppearance";
import { sanitizeSvgMarkup } from "../../utils/svgSanitize";
import { BANNER_MAX_BYTES, BANNER_MIME_TYPES, type BannerSource } from "./CreateChannelModal";
import { ChannelIconPicker } from "./ChannelIconPicker";
import { ChannelPermissionsTab, type ChannelPermissionsTabActions } from "./ChannelPermissionsTab";
import { ChannelBansTab, type ChannelBansTabActions, type ChannelBansTabUser } from "./ChannelBansTab";
import { ChannelTalkPowerTab, type ChannelTalkPowerTabActions } from "./ChannelTalkPowerTab";
import { ForumTagManager, type ForumTagManagerActions } from "../forum/ForumTagManager";
import type { HubIcon, ForumTagDef } from "../../types";

// Small preset palette shared by both clients for channel/category accent
// colors. Free hex input is offered alongside these for anything more
// specific (matches the role-color picker's ROLE_ACCENT_COLORS palette).
const ACCENT_COLORS = [
  "#e74c3c", "#e67e22", "#f39c12", "#27ae60", "#16a085",
  "#2980b9", "#8e44ad", "#e91e63", "#7f8c8d",
];

type Tab = "settings" | "permissions" | "bans" | "moderation";

export interface ChannelSettingsModalChannel {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  custom_icon_svg: string | null;
  is_category: boolean;
  channel_type?: string;
  banner_url?: string | null;
  banner_file_id?: string | null;
  /** Forum channels only (forum.md §10.1). */
  forum_require_tag?: boolean;
}

interface Props {
  channel: ChannelSettingsModalChannel;
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
  /** Hub base URL, used only to preview an already-uploaded banner file. */
  hubUrl?: string;
  onSave: (
    name: string,
    description: string,
    color: string | null,
    icon: string | null,
    customIconSvg: string | null,
    banner?: BannerSource,
    forumRequireTag?: boolean,
  ) => void;
  onDelete: () => void;
  onClose: () => void;
  permissionsActions?: ChannelPermissionsTabActions;
  bansActions?: ChannelBansTabActions;
  bansUsers?: ChannelBansTabUser[];
  /** True only where the ban action actually persists a reason. */
  bansSupportReason?: boolean;
  talkPowerActions?: ChannelTalkPowerTabActions;
  listHubIcons?: () => Promise<HubIcon[]>;
  /** False hides the "Upload image" banner option, leaving only the URL
   * field — set by clients whose upload plumbing can't yet take a browser
   * File object (see client-parity notes on banner file upload). */
  bannerUploadSupported?: boolean;
  /** Forum channels only (forum.md §10.3) -- tag definitions editor. Unset
   * hides the section (e.g. a client that hasn't wired tag CRUD yet). */
  forumTagsActions?: ForumTagManagerActions;
  listForumTags?: (channelId: string) => Promise<ForumTagDef[]>;
}

export function ChannelSettingsModal({
  channel, saving, deleting, error, canManageRoles, isAdmin, myMaxPriority, hubUrl,
  onSave, onDelete, onClose,
  permissionsActions, bansActions, bansUsers, bansSupportReason, talkPowerActions, listHubIcons,
  bannerUploadSupported = true,
  forumTagsActions, listForumTags,
}: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>(isAdmin ? "settings" : "permissions");
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description ?? "");
  const [color, setColor] = useState<string | null>(channel.color ?? null);
  const [icon, setIcon] = useState<string | null>(channel.icon ?? null);
  const [customIconSvg, setCustomIconSvg] = useState<string | null>(channel.custom_icon_svg ?? null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [hubIcons, setHubIcons] = useState<HubIcon[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [requireTag, setRequireTag] = useState(channel.forum_require_tag ?? false);
  const [forumTags, setForumTags] = useState<ForumTagDef[]>([]);

  useEffect(() => {
    if (!listHubIcons) return;
    listHubIcons().then(setHubIcons).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isForum = channel.channel_type === "forum";

  useEffect(() => {
    if (!isForum || !listForumTags) return;
    listForumTags(channel.id).then(setForumTags).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isForum]);

  const isBanner = channel.channel_type === "banner";
  const [bannerSourceMode, setBannerSourceMode] = useState<"url" | "upload">(
    channel.banner_file_id ? "upload" : "url",
  );
  const [bannerUrl, setBannerUrl] = useState(channel.banner_url ?? "");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerFileError, setBannerFileError] = useState<string | null>(null);

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

  function handleSvgFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".svg")) {
      setUploadError("Only .svg files are supported.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const clean = sanitizeSvgMarkup(String(reader.result ?? ""));
      if (!clean) {
        setUploadError("Invalid or unsafe SVG — check the file and try again.");
      } else {
        setCustomIconSvg(clean);
        setUploadError(null);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const dirty =
    name.trim() !== channel.name ||
    description.trim() !== (channel.description ?? "") ||
    color !== (channel.color ?? null) ||
    icon !== (channel.icon ?? null) ||
    customIconSvg !== (channel.custom_icon_svg ?? null) ||
    bannerDirty ||
    requireTag !== (channel.forum_require_tag ?? false);

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
            <div style={{ display: "flex", gap: 8, marginBottom: "var(--space-3)", flexWrap: "wrap" }}>
              {isAdmin && (
                <button
                  className={tab === "settings" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setTab("settings")}
                >
                  {t("channel.settings.tab_settings")}
                </button>
              )}
              {permissionsActions && (
                <button
                  className={tab === "permissions" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setTab("permissions")}
                >
                  {t("channel.settings.tab_permissions")}
                </button>
              )}
              {bansActions && !channel.is_category && (
                <button
                  className={tab === "bans" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setTab("bans")}
                >
                  Bans
                </button>
              )}
              {isAdmin && talkPowerActions && !channel.is_category && (
                <button
                  className={tab === "moderation" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setTab("moderation")}
                >
                  {t("channel.settings.tab_moderation")}
                </button>
              )}
            </div>
          )}

          {tab === "bans" && bansActions && canManageRoles && !channel.is_category ? (
            <ChannelBansTab
              channelId={channel.id}
              actions={bansActions}
              users={bansUsers}
              supportsReason={bansSupportReason}
            />
          ) : tab === "moderation" && talkPowerActions && isAdmin && !channel.is_category ? (
            <ChannelTalkPowerTab channelId={channel.id} actions={talkPowerActions} />
          ) : (tab === "permissions" || !isAdmin) && permissionsActions && canManageRoles ? (
            <ChannelPermissionsTab channelId={channel.id} actions={permissionsActions} myMaxPriority={myMaxPriority} />
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

              {isForum && (
                <div className="settings-section">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={requireTag}
                      onChange={(e) => setRequireTag(e.target.checked)}
                    />
                    Require a tag on new posts
                  </label>
                  {forumTagsActions && (
                    <ForumTagManager
                      channelId={channel.id}
                      tags={forumTags}
                      onChange={setForumTags}
                      actions={forumTagsActions}
                    />
                  )}
                </div>
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
                  {bannerUploadSupported && (
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
                  )}
                  {bannerSourceMode === "url" || !bannerUploadSupported ? (
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
                  <span style={{ minWidth: 20, textAlign: "center" }}>{icon ?? ""}</span>
                  <EmojiPicker onPick={(e) => { setIcon(e); setCustomIconSvg(null); }} unicodeOnly />
                  {icon && (
                    <button type="button" className="btn-small btn-secondary" onClick={() => setIcon(null)}>
                      {t("modal.clear")}
                    </button>
                  )}
                  <span style={{ flex: 1 }} />
                  <span className="muted" style={{ fontSize: "var(--text-xs)" }}>Color</span>
                </div>
                <div className="color-swatch-row">
                  <button
                    type="button"
                    className={`color-swatch color-swatch-none ${color === null ? "selected" : ""}`}
                    onClick={() => setColor(null)}
                    title={t("channel.appearance.no_color")}
                  >
                    ✕
                  </button>
                  {ACCENT_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      className={`color-swatch ${color === hex ? "selected" : ""}`}
                      style={{ background: hex }}
                      onClick={() => setColor(hex)}
                      title={hex}
                    />
                  ))}
                </div>
                {safeRoleColor(color) && (
                  <span aria-hidden="true" style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: safeRoleColor(color)!, marginTop: 4 }} />
                )}
              </div>

              <div className="settings-section">
                <label className="settings-label">{t("channel.appearance.custom_svg")}</label>
                <p className="muted">
                  Upload your own .svg file. Scripts and external references are
                  stripped automatically.
                </p>
                {hubIcons.length > 0 && (
                  <div className="hub-icon-library">
                    <p className="muted" style={{ marginBottom: "6px" }}>{t("channel.appearance.hub_library")}</p>
                    <div className="icon-picker-grid">
                      {hubIcons.map((hi) => {
                        const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(hi.svg_content)}`;
                        const isSelected = customIconSvg === hi.svg_content;
                        return (
                          <button
                            key={hi.id}
                            type="button"
                            className={`icon-picker-tile ${isSelected ? "selected" : ""}`}
                            onClick={() => { setCustomIconSvg(hi.svg_content); setIcon(null); }}
                            title={hi.name}
                          >
                            <span className="icon-picker-glyph">
                              <img src={dataUri} width={18} height={18} style={{ objectFit: "contain" }} aria-hidden="true" />
                            </span>
                            <span className="icon-picker-label">{hi.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="custom-icon-upload-row">
                  {customIconSvg && (
                    <>
                      <div className="custom-icon-preview">
                        <ChannelIcon icon={null} customIconSvg={customIconSvg} size={32} />
                      </div>
                      <button type="button" className="btn-secondary" onClick={() => setCustomIconSvg(null)}>
                        {t("modal.delete")}
                      </button>
                    </>
                  )}
                  <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
                    {customIconSvg ? t("channel.appearance.replace_svg") : t("channel.appearance.upload_svg")}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".svg,image/svg+xml"
                    style={{ display: "none" }}
                    onChange={handleSvgFileChange}
                  />
                </div>
                {uploadError && (
                  <p style={{ color: "var(--danger)", marginTop: "4px" }}>{uploadError}</p>
                )}
              </div>

              <div className="settings-section">
                <label className="settings-label">
                  {t("channel.appearance.predefined")}{customIconSvg ? " (overridden by custom SVG)" : ""}
                </label>
                <div style={{ opacity: customIconSvg ? 0.4 : 1, pointerEvents: customIconSvg ? "none" : "auto" }}>
                  <ChannelIconPicker value={icon} onChange={(id) => { setIcon(id); }} />
                </div>
              </div>

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
                          customIconSvg,
                          bannerDirty
                            ? bannerSourceMode === "url"
                              ? { url: bannerUrl.trim() }
                              : { file: bannerFile }
                            : undefined,
                          isForum ? requireTag : undefined,
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
