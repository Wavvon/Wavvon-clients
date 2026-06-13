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
  selected,
  unread,
  muted,
  participants,
  isCurrentVoiceChannel,
  hubUrl,
  activeHubId,
  style,
  onClick,
  onDoubleClick,
  onContextMenu,
  onSettings,
}: {
  channel: Channel;
  selected: boolean;
  unread: boolean;
  muted: boolean;
  participants: VoiceParticipant[];
  isCurrentVoiceChannel: boolean;
  hubUrl?: string;
  activeHubId?: string | null;
  style?: React.CSSProperties;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onSettings?: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: channel.id });

  const isBanner = channel.channel_type === "banner";
  const bannerSrc = channel.banner_url
    ? channel.banner_url
    : channel.banner_file_id && hubUrl
    ? `${hubUrl}/uploads/${channel.banner_file_id}`
    : undefined;

  return (
    <li
      ref={setNodeRef}
      className={`channel-item-wrap ${isDragging ? "dragging" : ""}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ...style,
      }}
      {...attributes}
      {...listeners}
    >
      {isBanner ? (
        bannerSrc && (
          <img
            src={bannerSrc}
            alt=""
            style={{ width: "100%", height: "auto", display: "block", borderRadius: 4 }}
          />
        )
      ) : (
        <>
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
          >
            {unread && <span className="channel-unread-dot" />}
            <ChannelIcon icon={channel.icon} customIconSvg={channel.custom_icon_svg} />
            {" "}{channel.name}
            {activeHubId && hasDraft(`${activeHubId}/${channel.id}`) && (
              <span className="channel-draft-badge" title="Unsent draft">Draft</span>
            )}
            {muted && <span className="channel-muted-icon" title="Muted">🔕</span>}
            {participants.length > 0 && (
              <span
                className="channel-voice-badge"
                title={`${participants.length} in voice`}
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
                  <span className="channel-participant-icon">🎙️</span>
                  {p.display_name || p.public_key.slice(0, 12)}
                </li>
              ))}
            </ul>
          )}
        </>
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
  isDragTarget,
  onToggleCollapsed,
  onContextMenu,
  onAdd,
  onSettings,
}: {
  channel: Channel;
  children?: React.ReactNode;
  collapsed: boolean;
  childCount: number;
  style?: React.CSSProperties;
  isDragTarget?: boolean;
  onToggleCollapsed: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onAdd: () => void;
  onSettings?: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: channel.id });

  return (
    <li
      ref={setNodeRef}
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
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapsed();
          }}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        {(channel.icon || channel.custom_icon_svg) && (
          <ChannelIcon icon={channel.icon} customIconSvg={channel.custom_icon_svg} size={13} />
        )}
        <span className="category-name">{channel.name.toUpperCase()}</span>
        {collapsed && childCount > 0 && (
          <span className="category-count">{childCount}</span>
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
