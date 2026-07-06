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

function VoiceParticipantRow({
  participant,
  gain,
  isWhisperingToMe,
  onSetGain,
}: {
  participant: VoiceParticipant;
  gain: number;
  isWhisperingToMe?: boolean;
  onSetGain?: (publicKey: string, gainPct: number) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const label = participant.display_name || participant.public_key.slice(0, 12);

  return (
    <li
      className="channel-participant"
      title={participant.public_key}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen((v) => !v);
      }}
    >
      <span className="channel-participant-icon" aria-hidden="true">🎙️</span>
      {label}
      {isWhisperingToMe && (
        <span className="participant-whisper-badge" title={`${label} is whispering`}>
          whispering
        </span>
      )}
      {gain !== 100 && (
        <span
          className={`participant-gain-badge ${gain === 0 ? "gain-muted" : gain > 100 ? "gain-boosted" : "gain-reduced"}`}
          aria-label={`Volume: ${gain}%`}
        >
          {gain === 0 ? "🔇" : gain > 100 ? "🔊" : "🔉"}
        </span>
      )}
      {open && onSetGain && (
        <div
          className="participant-volume-popover"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="participant-volume-label">Volume: {gain}%</div>
          <input
            type="range"
            min={0}
            max={200}
            step={5}
            value={gain}
            className="participant-volume-slider"
            onChange={(e) => onSetGain(participant.public_key, Number(e.target.value))}
          />
          <div className="participant-volume-actions">
            <button
              className="participant-volume-reset"
              onClick={() => { onSetGain(participant.public_key, 100); setOpen(false); }}
            >
              Reset
            </button>
            <button className="participant-volume-close" onClick={() => setOpen(false)} aria-label="Close" title="Close">✕</button>
          </div>
        </div>
      )}
    </li>
  );
}

export function SortableBannerItem({
  channel,
  src,
  onContextMenu,
}: {
  channel: Channel;
  src: string;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: channel.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        padding: "4px 0",
        listStyle: "none",
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
    >
      <img
        src={src}
        alt=""
        style={{ width: "100%", height: "auto", display: "block", borderRadius: 4 }}
        draggable={false}
      />
    </li>
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
  style,
  tabIndex,
  voiceGains,
  inboundWhispers,
  onClick,
  onDoubleClick,
  onContextMenu,
  onKeyDown,
  onSettings,
  onSetVoiceGain,
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
  style?: React.CSSProperties;
  tabIndex?: number;
  voiceGains?: Record<string, number>;
  inboundWhispers?: Set<string>;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onSettings?: (e: React.MouseEvent) => void;
  onSetVoiceGain?: (publicKey: string, gainPct: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: channel.id });

  const ariaLabelParts = [channel.name];
  const uc = unreadCount ?? 0;
  const mc = mentionCount ?? 0;
  if (uc > 0) ariaLabelParts.push(`${uc} unread ${uc === 1 ? "message" : "messages"}`);
  if (mc > 0) ariaLabelParts.push(`${mc} ${mc === 1 ? "mention" : "mentions"}`);
  if (participants.length > 0) ariaLabelParts.push(`${participants.length} ${participants.length === 1 ? "person" : "people"} in voice`);
  const channelAriaLabel = ariaLabelParts.join(", ");

  return (
    <li
      ref={setNodeRef}
      tabIndex={tabIndex}
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
        {unread && <span className="channel-unread-dot" aria-hidden="true" />}
        <ChannelIcon icon={channel.icon} customIconSvg={channel.custom_icon_svg} channelType={channel.channel_type} />
        {channel.channel_type === "forum" && (
          <span className="forum-type-badge" title="Forum channel" aria-label="Forum channel">📋</span>
        )}
        {channel.name}
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
            <VoiceParticipantRow
              key={p.public_key}
              participant={p}
              gain={voiceGains?.[p.public_key] ?? 100}
              isWhisperingToMe={inboundWhispers?.has(p.public_key)}
              onSetGain={onSetVoiceGain}
            />
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
  isDragTarget,
  tabIndex,
  onToggleCollapsed,
  onContextMenu,
  onKeyDown,
  onAdd,
  onSettings,
}: {
  channel: Channel;
  children?: React.ReactNode;
  collapsed: boolean;
  childCount: number;
  style?: React.CSSProperties;
  isDragTarget?: boolean;
  tabIndex?: number;
  onToggleCollapsed: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onAdd: () => void;
  onSettings?: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: channel.id });

  return (
    <li
      role="group"
      aria-label={channel.name}
      ref={setNodeRef}
      tabIndex={tabIndex}
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
        {(channel.icon || channel.custom_icon_svg) && (
          <ChannelIcon icon={channel.icon} customIconSvg={channel.custom_icon_svg} size={13} />
        )}
        <span className="category-name">{channel.name.toUpperCase()}</span>
        {collapsed && childCount > 0 && (
          <span className="category-count" aria-hidden="true">{childCount}</span>
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
