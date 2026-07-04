import React from "react";
import { useTranslation } from "react-i18next";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Channel, VoiceParticipant } from "../types";
import { ChannelIcon } from "./Icons";
import { hasDraft } from "../utils/drafts";
import { isSpawnerChannel, isTemporaryChannel } from "../utils/spawnerChannels";
import { safeRoleColor } from "../utils/roleAppearance";

/** Hub icon wrapped in dnd-kit's useSortable so the user can drag-reorder
 * the hub sidebar. The drag handle is the whole icon — there's no second
 * action you'd want to bind to the icon itself except click, and that
 * still works because dnd-kit only kicks in after a small drag distance. */
export function SortableHubIcon({
  hubId,
  children,
}: {
  hubId: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: hubId });
  return (
    <div
      ref={setNodeRef}
      className={`hub-icon-wrap ${isDragging ? "dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

export function SortableChannelItem({
  channel,
  activeHubId,
  selected,
  unread,
  unreadCount,
  mentionCount,
  muted,
  participants,
  isCurrentVoiceChannel,
  hubUrl,
  ownerDisplayName,
  style,
  depth,
  depthOverflow,
  tabIndex,
  itemRef,
  onClick,
  onDoubleClick,
  onContextMenu,
  onKeyDown,
  onSettings,
}: {
  channel: Channel;
  activeHubId?: string | null;
  selected: boolean;
  unread: boolean;
  unreadCount?: number;
  mentionCount?: number;
  muted: boolean;
  participants: VoiceParticipant[];
  isCurrentVoiceChannel: boolean;
  hubUrl?: string;
  /** Resolved display name (or short pubkey) of a temp room's owner, for the tooltip. */
  ownerDisplayName?: string | null;
  style?: React.CSSProperties;
  /** True nesting depth, unclamped — powers aria-level (nested-channels-ux.md §2.5). */
  depth?: number;
  /** Past the indent cap: show a marker instead of more indent (§2.2). */
  depthOverflow?: boolean;
  tabIndex?: number;
  itemRef?: (el: HTMLLIElement | null) => void;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onSettings?: (e: React.MouseEvent) => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: channel.id });
  const setRefs = (el: HTMLLIElement | null) => {
    setNodeRef(el);
    itemRef?.(el);
  };

  const isBanner = channel.channel_type === "banner";
  const isSpawner = isSpawnerChannel(channel);
  const isTemporary = isTemporaryChannel(channel);
  const bannerSrc = channel.banner_url
    ? channel.banner_url
    : channel.banner_file_id && hubUrl
      ? `${hubUrl}/uploads/${channel.banner_file_id}`
      : undefined;

  if (isBanner) {
    return (
      <li
        ref={setRefs}
        id={`sidebar-node-${channel.id}`}
        className={`channel-item-wrap ${isDragging ? "dragging" : ""}`}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          ...style,
        }}
        onContextMenu={onContextMenu}
        {...attributes}
        {...listeners}
      >
        {bannerSrc && (
          <img
            src={bannerSrc}
            alt=""
            style={{ width: "100%", height: "auto", display: "block", borderRadius: 4 }}
          />
        )}
        {/* Management affordance for admins: without this a banner renders as a
            bare (often empty) row with no way to rename or delete it. Members
            still see just the image. */}
        {onSettings && (
          <div
            className="channel-banner-manage"
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 4px" }}
          >
            <span className="muted" style={{ flex: 1, fontSize: "var(--text-xs)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {channel.name}
            </span>
            <button
              className="channel-settings-btn"
              onClick={(e) => { e.stopPropagation(); onSettings(e); }}
              title="Channel settings"
              aria-label="Channel settings"
            >
              ⚙
            </button>
          </div>
        )}
      </li>
    );
  }

  const ariaLabelParts = [channel.name];
  if (isSpawner) {
    ariaLabelParts.push(t("channel.spawner.tooltip"));
  } else {
    const uc = unreadCount ?? 0;
    const mc = mentionCount ?? 0;
    if (uc > 0) ariaLabelParts.push(`${uc} unread ${uc === 1 ? "message" : "messages"}`);
    if (mc > 0) ariaLabelParts.push(`${mc} ${mc === 1 ? "mention" : "mentions"}`);
    if (participants.length > 0) ariaLabelParts.push(`${participants.length} ${participants.length === 1 ? "person" : "people"} in voice`);
  }
  const channelAriaLabel = ariaLabelParts.join(", ");

  const itemTitle = isSpawner
    ? t("channel.spawner.tooltip")
    : isTemporary
      ? t("channel.temp.owner_tooltip", { name: ownerDisplayName || channel.owner_pubkey?.slice(0, 12) || "?" })
      : "Double-click to join voice";

  return (
    <li
      ref={setRefs}
      id={`sidebar-node-${channel.id}`}
      tabIndex={tabIndex}
      aria-level={depth !== undefined ? depth + 1 : undefined}
      onKeyDown={onKeyDown}
      className={`channel-item-wrap ${isDragging ? "dragging" : ""}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ...style,
      }}
    >
      {/* Drag listeners + click/dblclick live on the inner row, not the
          outer li, so the nested participants list isn't a drag handle and
          dblclick on a participant doesn't trigger a voice join. */}
      <div
        className={`channel-item ${selected ? "selected" : ""} ${
          unread ? "unread" : ""
        } ${muted ? "muted" : ""} ${
          isCurrentVoiceChannel ? "in-voice-here" : ""
        } ${isSpawner ? "channel-item-spawner" : ""}`}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        title={itemTitle}
        {...attributes}
        {...listeners}
        aria-label={channelAriaLabel}
      >
        {depthOverflow && (
          <span className="channel-depth-marker" aria-hidden="true">›</span>
        )}
        {!isSpawner && unread && <span className="channel-unread-dot" aria-hidden="true" />}
        <ChannelIcon icon={channel.icon} customIconSvg={channel.custom_icon_svg} channelType={channel.channel_type} />
        {" "}{channel.name}
        {isTemporary && (
          <span className="channel-temp-badge">{t("channel.temp.badge")}</span>
        )}
        {!isSpawner && activeHubId && hasDraft(`${activeHubId}/${channel.id}`) && (
          <span className="channel-draft-badge" title="Unsent draft">Draft</span>
        )}
        {!isSpawner && muted && <span className="channel-muted-icon" title="Muted" aria-hidden="true">🔕</span>}
        {!isSpawner && participants.length > 0 && (
          <span
            className="channel-voice-badge"
            title={`${participants.length} in voice`}
            aria-hidden="true"
          >
            🎙️ {participants.length}
          </span>
        )}
        {onSettings && (
          <button
            className="channel-settings-btn"
            onClick={(e) => { e.stopPropagation(); onSettings(e); }}
            title="Channel settings"
            aria-label="Channel settings"
          >
            ⚙
          </button>
        )}
      </div>
      {!isSpawner && participants.length > 0 && (
        <ul className="channel-participants">
          {participants.map((p) => (
            <li
              key={p.public_key}
              className="channel-participant"
              title={p.public_key}
            >
              <span className="channel-participant-icon" aria-hidden="true">🎙️</span>
              {p.display_name || p.public_key.slice(0, 12)}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function SortableCategoryItem({
  channel,
  children,
  collapsed,
  childCount,
  style,
  depth,
  depthOverflow,
  isDragTarget,
  tabIndex,
  itemRef,
  onToggleCollapsed,
  onContextMenu,
  onKeyDown,
  onAdd,
  onSettings,
  onFocusSubtree,
  focusSubtreeLabel,
}: {
  channel: Channel;
  children?: React.ReactNode;
  collapsed: boolean;
  childCount: number;
  style?: React.CSSProperties;
  /** True nesting depth, unclamped — powers aria-level (nested-channels-ux.md §2.5). */
  depth?: number;
  /** Past the indent cap: show a marker instead of more indent (§2.2). */
  depthOverflow?: boolean;
  isDragTarget?: boolean;
  tabIndex?: number;
  itemRef?: (el: HTMLLIElement | null) => void;
  onToggleCollapsed: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onAdd: () => void;
  onSettings?: (e: React.MouseEvent) => void;
  /** Provided only past DRILL_DEPTH — re-roots the sidebar to this category (§2.2 drill-in). */
  onFocusSubtree?: () => void;
  focusSubtreeLabel?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: channel.id });
  const setRefs = (el: HTMLLIElement | null) => {
    setNodeRef(el);
    itemRef?.(el);
  };
  // Hubs are untrusted: validate the color to a plain 6-digit hex before it
  // reaches a CSS `background` sink, or a malicious hub could smuggle a
  // `url(...)` and beacon the viewer's IP/UA when the header renders.
  const catColor = safeRoleColor(channel.color);

  return (
    <li
      role="group"
      aria-label={channel.name}
      id={`sidebar-node-${channel.id}`}
      ref={setRefs}
      tabIndex={tabIndex}
      aria-level={depth !== undefined ? depth + 1 : undefined}
      onKeyDown={onKeyDown}
      className={`category-group ${isDragging ? "dragging" : ""}`}
      style={{
        transform: isDragTarget ? undefined : CSS.Transform.toString(transform),
        transition: isDragTarget ? undefined : transition,
        ...style,
      }}
    >
      <div
        className={`category-header ${isDragTarget ? "drag-target" : ""}`}
        style={catColor ? {
          background: `${catColor}26`,
          borderLeft: `3px solid ${catColor}`,
          paddingLeft: "6px",
        } : undefined}
        onContextMenu={onContextMenu}
        {...attributes}
        {...listeners}
      >
        <button
          className="category-chevron"
          aria-expanded={!collapsed}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapsed();
          }}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        {depthOverflow && (
          <span className="channel-depth-marker" aria-hidden="true">›</span>
        )}
        {(channel.icon || channel.custom_icon_svg) && (
          <ChannelIcon icon={channel.icon} customIconSvg={channel.custom_icon_svg} size={13} />
        )}
        <span className="category-name">{channel.name.toUpperCase()}</span>
        {collapsed && childCount > 0 && (
          <span className="category-count" aria-hidden="true">{childCount}</span>
        )}
        {onFocusSubtree && (
          <button
            className="btn-icon-small category-focus-btn"
            onClick={(e) => { e.stopPropagation(); onFocusSubtree(); }}
            title={focusSubtreeLabel}
            aria-label={focusSubtreeLabel}
          >
            ⤢
          </button>
        )}
        <button
          className="btn-icon-small"
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          title="Add…"
        >
          +
        </button>
        {onSettings && (
          <button
            className="btn-icon-small category-settings-btn"
            onClick={(e) => { e.stopPropagation(); onSettings(e); }}
            title="Category settings"
          >
            ⚙
          </button>
        )}
      </div>
      {!collapsed && children}
    </li>
  );
}
