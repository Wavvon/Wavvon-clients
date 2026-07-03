import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Channel, VoiceParticipant } from "../types";
import { ChannelIcon } from "./Icons";
import { hasDraft } from "../utils/drafts";

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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: channel.id });
  const setRefs = (el: HTMLLIElement | null) => {
    setNodeRef(el);
    itemRef?.(el);
  };

  const isBanner = channel.channel_type === "banner";
  const bannerSrc = channel.banner_url
    ? channel.banner_url
    : channel.banner_file_id && hubUrl
      ? `${hubUrl}/uploads/${channel.banner_file_id}`
      : undefined;

  if (isBanner) {
    return (
      <li
        ref={setRefs}
        className={`channel-item-wrap ${isDragging ? "dragging" : ""}`}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          ...style,
        }}
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
      </li>
    );
  }

  const ariaLabelParts = [channel.name];
  const uc = unreadCount ?? 0;
  const mc = mentionCount ?? 0;
  if (uc > 0) ariaLabelParts.push(`${uc} unread ${uc === 1 ? "message" : "messages"}`);
  if (mc > 0) ariaLabelParts.push(`${mc} ${mc === 1 ? "mention" : "mentions"}`);
  if (participants.length > 0) ariaLabelParts.push(`${participants.length} ${participants.length === 1 ? "person" : "people"} in voice`);
  const channelAriaLabel = ariaLabelParts.join(", ");

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
        }`}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        title="Double-click to join voice"
        {...attributes}
        {...listeners}
        aria-label={channelAriaLabel}
      >
        {depthOverflow && (
          <span className="channel-depth-marker" aria-hidden="true">›</span>
        )}
        {unread && <span className="channel-unread-dot" aria-hidden="true" />}
        <ChannelIcon icon={channel.icon} customIconSvg={channel.custom_icon_svg} channelType={channel.channel_type} />
        {" "}{channel.name}
        {activeHubId && hasDraft(`${activeHubId}/${channel.id}`) && (
          <span className="channel-draft-badge" title="Unsent draft">Draft</span>
        )}
        {muted && <span className="channel-muted-icon" title="Muted" aria-hidden="true">🔕</span>}
        {participants.length > 0 && (
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
      {participants.length > 0 && (
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
        style={channel.color ? {
          background: `${channel.color}26`,
          borderLeft: `3px solid ${channel.color}`,
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
