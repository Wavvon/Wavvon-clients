import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SoundboardChip, VoiceParticipant } from "../../types";
import { Avatar } from "../Avatar";
import { SoundboardBurst } from "../SoundboardBurst";
import { SelfStateIcon } from "../SortableItems";
import { PopOutRoom } from "./PopOutRoom";
import { FreeStage } from "./FreeStage";
import { LIVES_ITEM, loadFreeLayout, saveFreeLayout, type FreeLayout } from "../../utils/freeLayout";
import { LiveTray, type VoiceLive } from "./LiveTray";
import { VoiceRoomMap, type VoiceRoomMapInfo } from "./VoiceRoomMap";
import { setVoiceBarSlot } from "../../utils/voiceBarSlot";
import { PinIcon, ExpandIcon, CalendarIcon, ScreenShareIcon, FullscreenIcon, SpeakerIcon } from "../Icons";
import { friendsFirst } from "../../utils/friendsFirst";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/** The floor in a room with a talk-power threshold (the hub's `voice.hands`). */
export interface VoiceFloor {
  /** Who has a hand raised, oldest first. */
  hands: string[];
  /** Whether the relay carries what you send in this room. */
  maySpeak: boolean;
  /** You may give the floor or lower someone's hand (`moderation.mute`). */
  canGrant: boolean;
  onRaise: () => void;
  onLower: () => void;
  onGrant: (publicKey: string) => void;
  onDismiss: (publicKey: string) => void;
}

export interface VoiceStagePins {
  /** Who the hub has on this room's stage, in pin order. */
  pins: string[];
  /** You may pin and unpin anyone (`moderation.mute`); otherwise only step off yourself. */
  canPin: boolean;
  onPin: (publicKey: string) => void;
  onUnpin: (publicKey: string) => void;
}

/** The hub's pins in this viewer's order: their own arrangement first, newcomers after. */
export function orderedPins(hubPins: string[], order: string[]): string[] {
  return [...order.filter((pk) => hubPins.includes(pk)), ...hubPins.filter((pk) => !order.includes(pk))];
}

export interface VoiceStageInfo {
  participants: VoiceParticipant[];
  /** Your friends' pubkeys: they lead the audience. */
  friends?: Set<string>;
  /** Pubkeys speaking right now (yours included). */
  speaking: Set<string>;
  /** Member avatars by pubkey; a visitor from an allied hub has none. */
  avatars: Map<string, string | null>;
  /** You are already in this room. */
  inThisRoom: boolean;
  onJoin: () => void;
  /** Your own pubkey, to find your raised hand. */
  publicKey?: string | null;
  /** Absent on a hub without `voice.hands`, and when you are not in the room. */
  floor?: VoiceFloor;
  /** The room's screen shares and cameras; absent when nobody shares. */
  live?: VoiceLive;
  /** Your own share as you capture it: the hub does not send you your own stream. */
  /** `kbps` is what is actually being sent, which the browser may keep below the choice. */
  selfShare?: { stream: MediaStream; kbps: number; onStop: () => void };
  /** The room map; absent when you are not in the room. */
  room?: VoiceRoomMapInfo;
  /** Cameras on in this call, by pubkey, yours included. */
  cameras?: Map<string, MediaStream>;
  /** Recent soundboard plays in this room, for the burst on the player. */
  soundboardChips?: SoundboardChip[];
  /** The room's stage as the hub holds it; absent on a hub without `voice.pins`,
   *  where pins are this viewer's own for the session. */
  stagePins?: VoiceStagePins;
}

const MIN_STAGE = 120;
/** Up to this many people, every camera opens by itself. */
export const SMALL_ROOM = 12;

/** Cameras to open without asking: a pinned person's, or anyone's in a small room. */
export function camerasToOpen(
  streams: { stream_id: string; sharer_pubkey: string; kind?: string }[],
  pins: string[],
  roomSize: number,
): string[] {
  return streams
    .filter((s) => s.kind === "webcam" && (pins.includes(s.sharer_pubkey) || roomSize <= SMALL_ROOM))
    .map((s) => s.stream_id);
}

function CameraVideo({ stream, mirrored }: { stream: MediaStream; mirrored: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} className={`voice-tile-camera${mirrored ? " mirrored" : ""}`} autoPlay muted playsInline />;
}

function SelfShareTile({ stream, onStop, label, stopLabel, sent, fullscreenLabel }: { stream: MediaStream; onStop: () => void; label: string; stopLabel: string; sent: string; fullscreenLabel: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <li className="voice-tile voice-tile--stream voice-self-share">
      <video ref={ref} autoPlay muted playsInline />
      <span className="voice-tile-name"><span className="live-badge">LIVE</span> {label} · {sent}</span>
      <div className="voice-tile-actions">
        <button type="button" className="btn-icon" title={fullscreenLabel} aria-label={fullscreenLabel} onClick={() => { void ref.current?.requestFullscreen?.(); }}>
          <FullscreenIcon size={13} />
        </button>
        <button type="button" className="btn-small" onClick={onStop}>{stopLabel}</button>
      </div>
    </li>
  );
}

/**
 * A voice channel is people and media only. The stage holds who you pinned
 * and what you opened; the audience is everyone else, friends first and then
 * in arrival order, and
 * nobody moves when they speak. With nothing on the stage the audience fills
 * the room. `children` is the viewer of the opened streams.
 */
export function VoiceStage({
  participants, friends, speaking, avatars, inThisRoom, onJoin, publicKey, floor, live, selfShare, room, cameras, soundboardChips, stagePins,
  roomName, connectionStatus, onOpenEvents, onOpenHubStreams, liveShareCount = 0, children,
}: VoiceStageInfo & {
  children?: React.ReactNode;
  roomName?: string;
  /** The latency chip, shown beside the room name. */
  connectionStatus?: React.ReactNode;
  onOpenEvents?: () => void;
  /** The hub-wide list of lives, from any channel. */
  onOpenHubStreams?: () => void;
  liveShareCount?: number;
}) {
  const { t } = useTranslation();
  // Without hub pins they last one voice session: leaving the room or moving
  // to another one clears them, so nobody is still pinned next time.
  const [localPins, setLocalPins] = useState<string[]>([]);
  useEffect(() => { setLocalPins([]); setOrder([]); }, [inThisRoom, roomName]);
  // The hub decides who is on the stage; the order is each viewer's own.
  const [order, setOrder] = useState<string[]>([]);
  const pins = stagePins ? orderedPins(stagePins.pins, order) : localPins;
  const [big, setBig] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [audienceCollapsed, setAudienceCollapsed] = useState(false);
  const [freeLayout, setFreeLayoutState] = useState<FreeLayout>(loadFreeLayout);
  function setFreeLayout(next: FreeLayout) {
    setFreeLayoutState(next);
    saveFreeLayout(next);
  }
  const [stageHeight, setStageHeight] = useState<number | null>(null);
  const roomRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Opening a live puts it on the stage; bring the stage into view, or the
  // member has to go looking for what they just opened (#492).
  const openedCount = live?.opened.size ?? 0;
  const prevOpened = useRef(openedCount);
  useEffect(() => {
    if (openedCount > prevOpened.current) {
      stageRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    }
    prevOpened.current = openedCount;
  }, [openedCount]);

  const barRef = useCallback((el: HTMLDivElement | null) => setVoiceBarSlot(el), []);

  // Each camera is opened for you at most once: closing it is a choice that sticks.
  const autoOpened = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!live || !inThisRoom) return;
    for (const id of camerasToOpen(live.streams, pins, participants.length)) {
      if (autoOpened.current.has(id) || live.opened.has(id)) continue;
      autoOpened.current.add(id);
      live.onOpen(id);
    }
  }, [live, pins, participants.length, inThisRoom]);

  function togglePin(pk: string) {
    const pinned = pins.includes(pk);
    if (stagePins) {
      if (pinned) stagePins.onUnpin(pk); else stagePins.onPin(pk);
      return;
    }
    setLocalPins(pinned ? pins.filter((p) => p !== pk) : [...pins, pk]);
  }
  const mayTogglePin = (pk: string) =>
    !stagePins || stagePins.canPin || (pk === publicKey && pins.includes(pk));

  const myHandUp = !!floor && !!publicKey && floor.hands.includes(publicKey);
  const sharing = new Set(live?.streams.map((s) => s.sharer_pubkey));
  // The stage follows the order of the pins, which dragging rearranges.
  const onStage = pins
    .map((pk) => participants.find((p) => p.public_key === pk))
    .filter((p): p is VoiceParticipant => !!p);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function onStageDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = pins.indexOf(String(active.id));
    const to = pins.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(pins, from, to);
    if (stagePins) setOrder(next); else setLocalPins(next);
  }
  const audience = friendsFirst(participants.filter((p) => !pins.includes(p.public_key)), friends);
  const opened = !!live && live.opened.size > 0;
  // Your own share is a tile beside yours, not the stage: you know what you
  // are sharing, and on the stage it only mirrors itself.
  const liveOnStage = opened;
  // Stage and audience exist only once someone is pinned: the stage is who
  // you pinned, the audience everyone else.
  const showLabels = onStage.length > 0;
  // Your share travels with your tile: beside it in the room, on the stage
  // when you are pinned.
  const myPinned = !!publicKey && pins.includes(publicKey);
  const myShare = selfShare ? (
    <SelfShareTile
      stream={selfShare.stream}
      onStop={selfShare.onStop}
      label={t("voice.stage.you_share")}
      stopLabel={t("voice.screen_share.stop")}
      sent={t("voice.stage.sending", { mbps: (selfShare.kbps / 1000).toFixed(1) })}
      fullscreenLabel={t("voice.stage.share_fullscreen")}
    />
  ) : null;
  const hasStage = onStage.length > 0 || liveOnStage;
  const q = query.trim().toLowerCase();
  const shown = q
    ? audience.filter((p) => (p.display_name ?? p.public_key).toLowerCase().includes(q))
    : audience;

  // Dragging the separator gives the stage more room, down to an audience strip.
  function startResize(e: React.PointerEvent) {
    const room = roomRef.current;
    if (!room) return;
    e.preventDefault();
    const top = room.getBoundingClientRect().top;
    const max = room.clientHeight - 72;
    const move = (ev: PointerEvent) => setStageHeight(Math.max(MIN_STAGE, Math.min(max, ev.clientY - top)));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // With nothing on the stage the tiles fill the room, as large as the
  // headcount allows; under a stage the audience is a strip of small tiles.
  // A live on the stage shrinks the audience to a strip of faces.
  const tileSize = liveOnStage ? "strip" : hasStage ? "s" : participants.length <= 6 ? "l" : participants.length <= 12 ? "m" : "s";
  const tileAvatar = { l: 100, m: 72, s: 48, strip: 40 }[tileSize];

  function personTile(p: VoiceParticipant, size: number, sortable?: SortableHandle) {
    const name = p.display_name || p.public_key.slice(0, 12);
    const handUp = !!floor?.hands.includes(p.public_key);
    const pinned = pins.includes(p.public_key);
    // A camera shows in its owner's tile on the stage, and everywhere while
    // the room is small; in a big room's audience it is only a badge.
    const camera = cameras?.get(p.public_key);
    const showCamera = !!camera && (pinned || participants.length <= SMALL_ROOM);
    return (
      <li
        key={p.public_key}
        className={`voice-tile${speaking.has(p.public_key) ? " speaking" : ""}${big === p.public_key ? " big" : ""}${showCamera ? " has-camera" : ""}`}
        title={p.public_key}
        ref={sortable?.setNodeRef}
        style={sortable?.style}
        {...sortable?.attributes}
        {...sortable?.listeners}
        aria-roledescription={sortable ? t("voice.stage.sortable") : undefined}
      >
        {showCamera && camera
          ? <CameraVideo stream={camera} mirrored={p.public_key === publicKey} />
          : <Avatar src={avatars.get(p.public_key)} name={name} pubkey={p.public_key} size={size} self={p.public_key === publicKey} />}
        <SoundboardBurst chips={soundboardChips} pubkey={p.public_key} />
        <span className="voice-tile-state"><SelfStateIcon participant={p} /></span>
        {(sharing.has(p.public_key) || (camera && !showCamera) || pinned) && (
          <span className="voice-tile-badges">
            {sharing.has(p.public_key)
              ? <span className="live-badge">LIVE</span>
              : camera && !showCamera
                ? <span className="cam-badge" title={t("voice.stage.camera_on")}>{t("voice.stage.camera_badge")}</span>
                : <span className="voice-tile-pinned" role="img" aria-label={t("voice.stage.pinned")}><PinIcon size={14} /></span>}
          </span>
        )}
        <span className="voice-tile-name">
          {handUp && <span className="voice-stage-hand" role="img" aria-label={t("voice.stage.hand_raised")}>✋ </span>}
          {name}
        </span>
        <div className="voice-tile-actions">
          {mayTogglePin(p.public_key) && <button
            type="button"
            className={pinned ? "btn-icon" : "voice-tile-pin"}
            aria-pressed={pinned}
            aria-label={t(pinned ? "voice.stage.unpin" : "voice.stage.pin", { name })}
            title={t(pinned ? "voice.stage.unpin" : "voice.stage.pin", { name })}
            onClick={() => togglePin(p.public_key)}
          >
            <PinIcon size={12} />
            {!pinned && <span>{t("voice.stage.pin_short")}</span>}
          </button>}
          {pinned && (
            <button
              type="button"
              className="btn-icon"
              aria-pressed={big === p.public_key}
              aria-label={t("voice.stage.enlarge", { name })}
              title={t("voice.stage.enlarge", { name })}
              onClick={() => setBig((b) => (b === p.public_key ? null : p.public_key))}
            >
              <ExpandIcon size={13} />
            </button>
          )}
          {showCamera && (
            <button
              type="button"
              className="btn-icon"
              aria-label={t("voice.stage.camera_fullscreen", { name })}
              title={t("voice.stage.camera_fullscreen", { name })}
              onClick={(e) => { void e.currentTarget.closest(".voice-tile")?.querySelector("video")?.requestFullscreen?.(); }}
            >
              <FullscreenIcon size={13} />
            </button>
          )}
        </div>
        {handUp && floor?.canGrant && p.public_key !== publicKey && (
          <span className="voice-stage-floor-actions">
            <button className="btn-small" onClick={() => floor.onGrant(p.public_key)}>{t("voice.stage.grant")}</button>
            <button className="btn-small btn-secondary" onClick={() => floor.onDismiss(p.public_key)}>{t("voice.stage.dismiss")}</button>
          </span>
        )}
      </li>
    );
  }

  return (
    <section className={`voice-room${liveOnStage ? " has-live" : ""}`} ref={roomRef} aria-label={t("voice.stage.label")}>
      <div className="voice-room-bar">
        {roomName !== undefined && (
          <span className="voice-room-title">
            <SpeakerIcon />
            <span className="voice-room-name">{roomName}</span>
            <span className="voice-room-count">
              {t("voice.stage.in_voice", { count: participants.length })}
              {cameras && cameras.size > 0 && <>{" · "}{t("voice.stage.cameras", { count: cameras.size })}</>}
            </span>
          </span>
        )}
        {connectionStatus}
        {/* Your own share is not something to open: it is already a tile. */}
        {live && <LiveTray {...live} streams={live.streams.filter((st) => st.sharer_pubkey !== publicKey)} />}
        {onOpenHubStreams && (
          <button
            type="button"
            className="btn-icon-header voice-room-events"
            onClick={onOpenHubStreams}
            title={t("content.streams.title")}
            aria-label={liveShareCount > 0 ? t("content.streams.title_live", { count: liveShareCount }) : t("content.streams.title")}
          >
            <ScreenShareIcon size={14} />
          </button>
        )}
        {onOpenEvents && (
          <button type="button" className="btn-icon-header" onClick={onOpenEvents} title={t("events.open_panel")} aria-label={t("events.open_panel")}>
            <CalendarIcon size={14} />
          </button>
        )}
      </div>

      {hasStage && (
        <>
          {(showLabels || freeLayout.mode === "free") && (
            <div className="voice-stage-head">
              {showLabels && (
                <span className="voice-section-label">
                  <PinIcon size={13} />
                  {t("voice.stage.stage_label", { count: onStage.length + (live?.opened.size ?? 0) })}
                </span>
              )}
              {freeLayout.mode === "free" && (
                <button type="button" className="btn-small btn-secondary" onClick={() => setFreeLayout({ ...freeLayout, top: freeLayout.top === "people" ? "lives" : "people" })}>
                  {t(freeLayout.top === "people" ? "voice.stage.top_lives" : "voice.stage.top_people")}
                </button>
              )}
            </div>
          )}
          <div className={`voice-stage-area${liveOnStage ? " has-live" : ""}`} ref={stageRef} style={stageHeight ? { height: stageHeight, flex: "none" } : undefined}>
            {freeLayout.mode === "free" ? (
              <FreeStage
                layout={freeLayout}
                onChange={setFreeLayout}
                items={[
                  ...(opened
                    ? [{
                        id: LIVES_ITEM,
                        layer: "lives" as const,
                        node: <div className="free-lives">{children}</div>,
                      }]
                    : []),
                  ...onStage.map((p) => ({
                    id: p.public_key,
                    layer: "people" as const,
                    node: <ul className="voice-tiles free-tile">{personTile(p, 96)}</ul>,
                  })),
                ]}
              />
            ) : (<>
            {liveOnStage && (
              <div className="voice-stage-lives">{children}</div>
            )}
            {onStage.length > 0 && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onStageDragEnd}>
                <SortableContext items={onStage.map((p) => p.public_key)} strategy={rectSortingStrategy}>
                  <ul className="voice-tiles stage">
                    {onStage.map((p) => (
                      <React.Fragment key={p.public_key}>
                        <SortableStageTile id={p.public_key}>
                          {(handle) => personTile(p, 96, handle)}
                        </SortableStageTile>
                        {p.public_key === publicKey && myShare}
                      </React.Fragment>
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
            </>)}
          </div>
          <div
            className="voice-room-sep"
            role="separator"
            aria-orientation="horizontal"
            aria-label={t("voice.stage.resize")}
            onPointerDown={startResize}
          />
        </>
      )}

      <div className="voice-audience">
        {participants.length === 0 ? (
          // An empty room is a doorway: its name, that nobody is in, and the way in.
          <div className="voice-room-empty">
            <h2><SpeakerIcon size={26} /> {roomName}</h2>
            <p>{t("voice.stage.empty")}</p>
            {!inThisRoom && (
              <button type="button" className="voice-room-join-btn" onClick={onJoin}>{t("voice.stage.join")}</button>
            )}
          </div>
        ) : (
          <>
            <div className="voice-audience-head">
              {hasStage && showLabels && <span className="voice-audience-label">{t("voice.stage.audience", { count: audience.length })}</span>}
              {audience.length > 8 && (
                <input
                  type="search"
                  value={query}
                  placeholder={t("voice.stage.search")}
                  aria-label={t("voice.stage.search")}
                  onChange={(e) => setQuery(e.target.value)}
                />
              )}
              {hasStage && showLabels && (
                <button type="button" className="btn-small btn-secondary" aria-expanded={!audienceCollapsed} onClick={() => setAudienceCollapsed((v) => !v)}>
                  {t(audienceCollapsed ? "voice.stage.expand" : "voice.stage.collapse")}
                </button>
              )}
            </div>
            {/* With no stage the room is everyone, so the tiles take the room. */}
            <ul className={`voice-tiles audience size-${tileSize}${audienceCollapsed ? " collapsed" : ""}${hasStage ? "" : " roomy"}`}>
              {shown.map((p) => (
                <React.Fragment key={p.public_key}>
                  {personTile(p, tileAvatar)}
                  {p.public_key === publicKey && myShare}
                </React.Fragment>
              ))}
              {/* In the free layout the stage has no slot for it: it stays here. */}
              {freeLayout.mode === "free" && myPinned && myShare}
            </ul>
          </>
        )}
      </div>

      {/* With people in the room the way in sits where the dock will be. */}
      {!inThisRoom && participants.length > 0 && (
        <div className="voice-room-join">
          <button type="button" className="voice-room-join-btn" onClick={onJoin}>{t("voice.stage.join")}</button>
        </div>
      )}
      {inThisRoom && floor && !floor.maySpeak && (
        <div className="voice-room-join floor">
          <span className="muted">{myHandUp ? t("voice.stage.waiting") : t("voice.stage.listening")}</span>
          {myHandUp ? (
            <button className="btn-secondary" onClick={floor.onLower}>{t("voice.stage.lower_hand")}</button>
          ) : (
            <button className="btn-primary" onClick={floor.onRaise}>{t("voice.stage.raise_hand")}</button>
          )}
        </div>
      )}
      {inThisRoom && room && (
        <VoiceRoomMap room={room} participants={participants} avatars={avatars} publicKey={publicKey} />
      )}
      {/* One floating dock for the room's controls. The sidebar fills the slot
          (you, media, leave); the room adds its own extras beside them. */}
      {inThisRoom && (
        <div className="voice-room-controls voice-dock">
          <div className="voice-dock-slot" ref={barRef} />
          <div className="voice-dock-group extra">
            <PopOutRoom
              people={onStage.length > 0 ? onStage : participants}
              cameras={cameras}
              avatars={avatars}
              publicKey={publicKey}
              livesKey={[...(live?.opened ?? [])].join(",")}
              free={hasStage && freeLayout.mode === "free" ? freeLayout : undefined}
            />
            {hasStage && (
              <button
                type="button"
                className={`btn-icon-gear${freeLayout.mode === "free" ? " on" : ""}`}
                aria-pressed={freeLayout.mode === "free"}
                title={t(freeLayout.mode === "free" ? "voice.stage.layout_grid" : "voice.stage.layout_free")}
                aria-label={t(freeLayout.mode === "free" ? "voice.stage.layout_grid" : "voice.stage.layout_free")}
                onClick={() => setFreeLayout({ ...freeLayout, mode: freeLayout.mode === "free" ? "grid" : "free" })}
              >
                <LayoutGlyph />
              </button>
            )}
            {room && room.canManage && !room.zone && (
              <button type="button" className="btn-icon-gear" onClick={room.onEnable} title={t("voice.room_map.enable")} aria-label={t("voice.room_map.enable")}>
                <MapGlyph />
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

type SortableHandle = {
  setNodeRef: (el: HTMLElement | null) => void;
  style: React.CSSProperties;
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
};

/** A stage tile that can be dragged, or moved with the keyboard (space, then
 *  the arrows), to reorder the stage. */
function SortableStageTile({ id, children }: { id: string; children: (handle: SortableHandle) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return <>{children({
    setNodeRef,
    style: { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : undefined },
    attributes,
    // Space or Enter on the tile's own buttons (pin, enlarge) must press them,
    // not pick the tile up.
    listeners: listeners && {
      ...listeners,
      onKeyDown: (e: React.KeyboardEvent) => { if (e.target === e.currentTarget) listeners.onKeyDown?.(e); },
    },
  })}</>;
}

function MapGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />
    </svg>
  );
}

function LayoutGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 4h10v9H3zM15 4h6v5h-6zM15 11h6v9h-6zM3 15h10v5H3z" />
    </svg>
  );
}
