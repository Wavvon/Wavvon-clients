import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FocusTrap } from "../FocusTrap";
import { EmojiPicker } from "../content/EmojiPicker";
import { ChannelIcon, CHANNEL_ICONS, ChannelIconGlyph } from "../Icons";
import { ColorSwatchPicker } from "../admin/ColorSwatchPicker";
import { sanitizeSvgMarkup } from "../../utils/svgSanitize";
import { ChannelPermissionsTab, type ChannelPermissionsTabActions } from "./ChannelPermissionsTab";
import { ChannelBansTab, type ChannelBansTabActions, type ChannelBansTabUser } from "./ChannelBansTab";
import { ChannelTalkPowerTab, type ChannelTalkPowerTabActions } from "./ChannelTalkPowerTab";
import { ChannelAlliancesTab, type ChannelAlliancesTabActions } from "./ChannelAlliancesTab";
import { ForumTagManager, type ForumTagManagerActions } from "../forum/ForumTagManager";
import type { HubIcon, ForumTagDef } from "../../types";

type Tab = "settings" | "permissions" | "bans" | "moderation" | "alliances";

// Hub-side banner upload cap (banner-channels.md): 512 KB, image formats only.
export const BANNER_MAX_BYTES = 512 * 1024;
export const BANNER_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export interface BannerSource {
  url?: string;
  file?: File | null;
}

type ChannelKind = "text" | "forum" | "banner" | "spawner" | "category";

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
  nsfw?: boolean;
}

export interface ChannelSettingsSaveFields {
  name: string;
  description: string;
  color: string | null;
  icon: string | null;
  customIconSvg: string | null;
  nsfw: boolean;
  banner?: BannerSource;
  forumRequireTag?: boolean;
  /** Create mode only ({@link ChannelSettingsModalChannel} channel === null). */
  channelType?: string;
  isCategory?: boolean;
  spawnerNameTemplate?: string;
}

interface Props {
  /** null = create mode: renders only the Settings tab plus the
   *  channel-type/category picker, and the primary button creates the
   *  channel instead of saving edits to an existing one. */
  channel: ChannelSettingsModalChannel | null;
  /** Create mode only: the category this channel is being created under. */
  createParentId?: string | null;
  createParentName?: string | null;
  /** Create mode only: seeds the type picker as a category (e.g. opened via
   *  a "new category" entry rather than the generic "new channel" one). */
  createInitialIsCategory?: boolean;
  saving: boolean;
  deleting: boolean;
  error: string | null;
  /** Reaching the channel-permission surfaces: the tab bar, the Permissions
   * tab and the channel ban list. `channels.permissions` as well as
   * `roles.manage` — editing one channel is a channel act, and splitting it
   * from hub-wide role management is the point of having both
   * (permissions.md §3, Channels). */
  canEditChannelPermissions: boolean;
  /** Rename/appearance/delete are admin-only; a member who only holds
   * `channels.permissions` opens straight into the Permissions tab and never
   * sees the settings form (the server rejects those actions for them
   * anyway). */
  isAdmin: boolean;
  /** Viewer's highest role priority — rows at/above it render read-only in
   * the Permissions tab (the hub rejects those edits). */
  myMaxPriority?: number;
  /** Hub base URL, used only to preview an already-uploaded banner file. */
  hubUrl?: string;
  onSave: (fields: ChannelSettingsSaveFields) => void;
  onDelete: () => void;
  onClose: () => void;
  permissionsActions?: ChannelPermissionsTabActions;
  bansActions?: ChannelBansTabActions;
  bansUsers?: ChannelBansTabUser[];
  /** True only where the ban action actually persists a reason. */
  bansSupportReason?: boolean;
  talkPowerActions?: ChannelTalkPowerTabActions;
  /** Which alliances carry this channel, edited here as well as from the hub
   *  admin panel. Admin-only, because sharing is an admin action on the hub.
   *  Omitted where a platform has no wrapper for it, and then no tab. */
  allianceActions?: ChannelAlliancesTabActions;
  listHubIcons?: () => Promise<HubIcon[]>;
  /** False hides the "Upload image" banner option, leaving only the URL
   * field — set by clients whose upload plumbing can't yet take a browser
   * File object (see client-parity notes on banner file upload). */
  bannerUploadSupported?: boolean;
  /** Forum channels only (forum.md §10.3) -- tag definitions editor. Unset
   * hides the section (e.g. a client that hasn't wired tag CRUD yet). Also
   * hidden in create mode: tags need a channel id that doesn't exist yet. */
  forumTagsActions?: ForumTagManagerActions;
  listForumTags?: (channelId: string) => Promise<ForumTagDef[]>;
}

export function ChannelSettingsModal({
  channel, createParentId, createParentName, createInitialIsCategory,
  saving, deleting, error, canEditChannelPermissions, isAdmin, myMaxPriority, hubUrl,
  onSave, onDelete, onClose,
  permissionsActions, bansActions, bansUsers, bansSupportReason, talkPowerActions, allianceActions, listHubIcons,
  bannerUploadSupported = true,
  forumTagsActions, listForumTags,
}: Props) {
  const { t } = useTranslation();
  const isCreate = channel === null;
  const [tab, setTab] = useState<Tab>(isAdmin ? "settings" : "permissions");
  const [name, setName] = useState(channel?.name ?? "");
  const [description, setDescription] = useState(channel?.description ?? "");
  const [color, setColor] = useState<string | null>(channel?.color ?? null);
  const [icon, setIcon] = useState<string | null>(channel?.icon ?? null);
  const [customIconSvg, setCustomIconSvg] = useState<string | null>(channel?.custom_icon_svg ?? null);
  const [nsfw, setNsfw] = useState(channel?.nsfw ?? false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [hubIcons, setHubIcons] = useState<HubIcon[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [requireTag, setRequireTag] = useState(channel?.forum_require_tag ?? false);
  const [forumTags, setForumTags] = useState<ForumTagDef[]>([]);
  const [kind, setKind] = useState<ChannelKind>(createInitialIsCategory ? "category" : "text");
  const [spawnerNameTemplate, setSpawnerNameTemplate] = useState("");

  useEffect(() => {
    if (!listHubIcons) return;
    listHubIcons().then(setHubIcons).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCategory = isCreate ? kind === "category" : channel.is_category;
  const channelType = isCreate ? (isCategory ? "text" : kind) : channel.channel_type;
  const isForum = channelType === "forum";
  const isSpawner = isCreate && kind === "spawner";

  useEffect(() => {
    if (!isForum || !listForumTags || isCreate || !channel) return;
    listForumTags(channel.id).then(setForumTags).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isForum, isCreate]);

  const isBanner = channelType === "banner";
  const [bannerSourceMode, setBannerSourceMode] = useState<"url" | "upload">(
    channel?.banner_file_id ? "upload" : "url",
  );
  const [bannerUrl, setBannerUrl] = useState(channel?.banner_url ?? "");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerFileError, setBannerFileError] = useState<string | null>(null);

  const currentBannerSrc = channel?.banner_url
    ? channel.banner_url
    : channel?.banner_file_id && hubUrl
      ? `${hubUrl}/uploads/${channel.banner_file_id}`
      : undefined;

  const bannerDirty =
    !isCreate &&
    isBanner &&
    (bannerSourceMode === "upload"
      ? bannerFile !== null
      : bannerUrl.trim() !== (channel?.banner_url ?? "") && bannerUrl.trim() !== "");

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

  const isEmojiIcon = icon !== null && !CHANNEL_ICONS.some((d) => d.id === icon);
  const isUploadedSvg = customIconSvg !== null && !hubIcons.some((hi) => hi.svg_content === customIconSvg);

  const dirty =
    !isCreate &&
    (name.trim() !== channel.name ||
      description.trim() !== (channel.description ?? "") ||
      color !== (channel.color ?? null) ||
      icon !== (channel.icon ?? null) ||
      customIconSvg !== (channel.custom_icon_svg ?? null) ||
      bannerDirty ||
      nsfw !== (channel.nsfw ?? false) ||
      requireTag !== (channel.forum_require_tag ?? false));

  const canSubmit = isCreate ? name.trim().length > 0 : name.trim().length > 0 && dirty;

  function handleSubmit() {
    if (!name.trim()) return;
    const fields: ChannelSettingsSaveFields = {
      name: name.trim(),
      description: description.trim(),
      color,
      icon,
      customIconSvg,
      nsfw,
    };
    if (isForum) fields.forumRequireTag = requireTag;
    if (isBanner) {
      fields.banner = isCreate || bannerDirty
        ? bannerSourceMode === "url"
          ? { url: bannerUrl.trim() || undefined }
          : { file: bannerFile }
        : undefined;
    }
    if (isCreate) {
      fields.channelType = channelType;
      fields.isCategory = isCategory;
      if (isSpawner) {
        const trimmed = spawnerNameTemplate.trim();
        fields.spawnerNameTemplate = trimmed.length > 0 ? trimmed : undefined;
      }
    }
    onSave(fields);
  }

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
            {isCreate
              ? (isCategory ? t("channel.create.title_category") : t("channel.create.title_channel"))
              : channel.is_category ? t("channel.settings.title_category") : t("channel.settings.title_channel")}
          </h3>

          {!isCreate && canEditChannelPermissions && (
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
                  {t("channel.settings.tab_bans")}
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
              {isAdmin && allianceActions && (
                <button
                  className={tab === "alliances" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setTab("alliances")}
                >
                  {t("channel.settings.tab_alliances")}
                </button>
              )}
            </div>
          )}

          {!isCreate && tab === "alliances" && allianceActions && isAdmin ? (
            <ChannelAlliancesTab
              channelId={channel.id}
              isCategory={channel.is_category}
              actions={allianceActions}
            />
          ) : !isCreate && tab === "bans" && bansActions && canEditChannelPermissions && !channel.is_category ? (
            <ChannelBansTab
              channelId={channel.id}
              actions={bansActions}
              users={bansUsers}
              supportsReason={bansSupportReason}
            />
          ) : !isCreate && tab === "moderation" && talkPowerActions && isAdmin && !channel.is_category ? (
            <ChannelTalkPowerTab channelId={channel.id} actions={talkPowerActions} />
          ) : !isCreate && (tab === "permissions" || !isAdmin) && permissionsActions && canEditChannelPermissions ? (
            <ChannelPermissionsTab channelId={channel.id} actions={permissionsActions} myMaxPriority={myMaxPriority} />
          ) : (
            <>
              {isCreate && createParentName && (
                <p className="muted" style={{ marginBottom: "var(--space-3)", fontSize: "var(--text-sm)" }}>
                  <strong>{t("channel.create.under_category", { name: createParentName })}</strong>
                </p>
              )}

              {isCreate && (
                <label style={{ display: "block", marginBottom: "var(--space-2)" }}>
                  <span className="label-text">{t("channel.create.type_label")}</span>
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as ChannelKind)}
                    style={{ display: "block", width: "100%", marginTop: 4 }}
                  >
                    <option value="text">{t("channel.create.type_text")}</option>
                    <option value="forum">{t("channel.create.type_forum")}</option>
                    <option value="banner">{t("channel.create.type_banner")}</option>
                    <option value="spawner">{t("channel.create.type_spawner")}</option>
                    <option value="category">{t("channel.create.type_category")}</option>
                  </select>
                </label>
              )}

              <label style={{ display: "block", marginBottom: "var(--space-2)" }}>
                <span className="label-text">{t("channel.settings.name")}</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmit();
                    if (e.key === "Escape") onClose();
                  }}
                  placeholder={isCreate
                    ? (isCategory ? t("channel.create.name_placeholder_category") : t("channel.create.name_placeholder_channel"))
                    : undefined}
                  autoFocus
                  style={{ display: "block", width: "100%", marginTop: 4 }}
                />
              </label>

              {isSpawner && (
                <label style={{ display: "block", marginBottom: "var(--space-3)" }}>
                  <span className="label-text">{t("channel.create.spawner_template_label")}</span>
                  <input
                    type="text"
                    value={spawnerNameTemplate}
                    onChange={(e) => setSpawnerNameTemplate(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSubmit();
                      if (e.key === "Escape") onClose();
                    }}
                    placeholder={t("channel.create.spawner_template_placeholder", { ph: "{user}" })}
                    style={{ display: "block", width: "100%", marginTop: 4 }}
                  />
                  <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                    {t("channel.create.spawner_template_hint", { ph: "{user}", def: "{user}'s room" })}
                  </span>
                </label>
              )}

              {!isCategory && !isSpawner && (
                <label style={{ display: "block", marginBottom: "var(--space-3)" }}>
                  <span className="label-text">{t("channel.settings.description_label")}</span>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
                    placeholder={t("channel.settings.description_placeholder")}
                    style={{ display: "block", width: "100%", marginTop: 4 }}
                  />
                </label>
              )}

              {!isCategory && (
                <div className="settings-section">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={nsfw}
                      onChange={(e) => setNsfw(e.target.checked)}
                    />
                    {t("channel.settings.nsfw")}
                  </label>
                </div>
              )}

              {isForum && (
                <div className="settings-section">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={requireTag}
                      onChange={(e) => setRequireTag(e.target.checked)}
                    />
                    {t("channel.settings.require_tag")}
                  </label>
                  {!isCreate && forumTagsActions && (
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
              {isCategory && (
                <div style={{ marginBottom: "var(--space-3)" }}>
                  <span className="label-text">{t("channel.appearance.category_color")}</span>
                  <ColorSwatchPicker value={color} onChange={setColor} noColorLabel={t("channel.appearance.no_color")} />
                </div>
              )}

              <div className="settings-section">
                <label className="settings-label">{t("channel.appearance.title")}</label>
                <div className="icon-picker-grid">
                  <button
                    type="button"
                    className={`icon-picker-tile ${icon === null && customIconSvg === null ? "selected" : ""}`}
                    onClick={() => { setIcon(null); setCustomIconSvg(null); }}
                    title={t("modal.clear")}
                  >
                    <span className="icon-picker-glyph">✕</span>
                    <span className="icon-picker-label">{t("modal.clear")}</span>
                  </button>

                  <div className={`icon-picker-tile icon-picker-emoji-tile ${isEmojiIcon ? "selected" : ""}`}>
                    <EmojiPicker
                      onPick={(e) => { setIcon(e); setCustomIconSvg(null); }}
                      unicodeOnly
                      buttonClassName="icon-picker-emoji-btn"
                    />
                    <span className="icon-picker-label">{isEmojiIcon ? icon : t("channel.appearance.emoji")}</span>
                  </div>

                  <button
                    type="button"
                    className={`icon-picker-tile ${isUploadedSvg ? "selected" : ""}`}
                    onClick={() => fileRef.current?.click()}
                    title={t("channel.appearance.upload_svg")}
                  >
                    <span className="icon-picker-glyph">
                      {isUploadedSvg
                        ? <ChannelIcon icon={null} customIconSvg={customIconSvg} size={18} />
                        : "⬆"}
                    </span>
                    <span className="icon-picker-label">{t("channel.appearance.upload_svg")}</span>
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".svg,image/svg+xml"
                    style={{ display: "none" }}
                    onChange={handleSvgFileChange}
                  />

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

                  {CHANNEL_ICONS.map((def) => (
                    <button
                      key={def.id}
                      type="button"
                      className={`icon-picker-tile ${icon === def.id ? "selected" : ""}`}
                      onClick={() => { setIcon(def.id); setCustomIconSvg(null); }}
                      title={t(`channel.icon.${def.id}`)}
                    >
                      <span className="icon-picker-glyph">
                        <ChannelIconGlyph icon={def.id} size={18} />
                      </span>
                      <span className="icon-picker-label">{t(`channel.icon.${def.id}`)}</span>
                    </button>
                  ))}
                </div>
                <p className="muted">{t("channel.settings.svg_hint")}</p>
                {uploadError && (
                  <p style={{ color: "var(--danger)", marginTop: "4px" }}>{uploadError}</p>
                )}
              </div>

              <div className="modal-actions" style={{ alignItems: "center" }}>
                {!isCreate && confirmDelete ? (
                  <>
                    <span style={{ marginRight: "auto", color: "var(--danger)", fontSize: "var(--text-sm)" }}>
                      {t("channel.settings.delete_confirm", { name: channel.name })}
                    </span>
                    <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>
                      {t("modal.cancel")}
                    </button>
                    <button className="btn-danger" disabled={deleting} onClick={onDelete}>
                      {deleting ? t("channel.settings.deleting") : t("channel.settings.delete_yes")}
                    </button>
                  </>
                ) : (
                  <>
                    {!isCreate && (
                      <button
                        className="btn-danger"
                        style={{ marginRight: "auto" }}
                        onClick={() => setConfirmDelete(true)}
                      >
                        {t("channel.settings.delete_button", {
                          type: channel.is_category ? t("channel.ctx.type_category") : t("channel.ctx.type_channel"),
                        })}
                      </button>
                    )}
                    <button onClick={onClose} className="btn-secondary">{t("modal.cancel")}</button>
                    <button
                      onClick={handleSubmit}
                      disabled={saving || !canSubmit}
                    >
                      {isCreate
                        ? (saving ? t("modal.creating") : t("modal.create"))
                        : (saving ? t("channel.settings.saving") : t("modal.save"))}
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
