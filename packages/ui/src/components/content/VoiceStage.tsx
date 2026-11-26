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
}

// Pins are the member's own, on this device, for every room.
const PINS_KEY = "wavvon:voice-pins";
function loadPins(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(PINS_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
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

function SelfShareTile({ stream, onStop, label, stopLabel, sent }: { stream: MediaStream; onStop: () => void; label: string; stopLabel: string; sent: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="voice-tile voice-tile--stream voice-self-share">
      <video ref={ref} autoPlay muted playsInline />
      <span className="voice-tile-name"><span className="live-badge">LIVE</span> {label} · {sent}</span>
      <div className="voice-tile-actions">
        <button type="button" className="btn-small" onClick={onStop}>{stopLabel}</button>
      </div>
    </div>
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
  participants, friends, speaking, avatars, inThisRoom, onJoin, publicKey, floor, live, selfShare, room, cameras, soundboardChips,
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
  const [pins, setPins] = useState<string[]>(loadPins);
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
    const next = pins.includes(pk) ? pins.filter((p) => p !== pk) : [...pins, pk];
    setPins(next);
    try { localStorage.setItem(PINS_KEY, JSON.stringify(next)); } catch { /* not remembered */ }
  }

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
    setPins(next);
    try { localStorage.setItem(PINS_KEY, JSON.stringify(next)); } catch { /* not remembered */ }
  }
  const audience = friendsFirst(participants.filter((p) => !pins.includes(p.public_key)), friends);
  const opened = !!live && live.opened.size > 0;
  const liveOnStage = opened || !!selfShare;
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
          <button
            type="button"
            className={pinned ? "btn-icon" : "voice-tile-pin"}
            aria-pressed={pinned}
            aria-label={t(pinned ? "voice.stage.unpin" : "voice.stage.pin", { name })}
            title={t(pinned ? "voice.stage.unpin" : "voice.stage.pin", { name })}
            onClick={() => togglePin(p.public_key)}
          >
            <PinIcon size={12} />
            {!pinned && <span>{t("voice.stage.pin_short")}</span>}
          </button>
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
        {live && <LiveTray {...live} />}
        {inThisRoom && (
          <PopOutRoom
            people={onStage.length > 0 ? onStage : participants}
            cameras={cameras}
            avatars={avatars}
            publicKey={publicKey}
            livesKey={[...(live?.opened ?? [])].join(",")}
            free={hasStage && freeLayout.mode === "free" ? freeLayout : undefined}
          />
        )}
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
          <div className="voice-stage-head">
            <span className="voice-section-label">
              <PinIcon size={13} />
              {t("voice.stage.stage_label", { count: onStage.length + (live?.opened.size ?? 0) + (selfShare ? 1 : 0) })}
            </span>
            <button type="button" className="btn-small btn-secondary" aria-pressed={freeLayout.mode === "free"} onClick={() => setFreeLayout({ ...freeLayout, mode: freeLayout.mode === "free" ? "grid" : "free" })}>
              {t(freeLayout.mode === "free" ? "voice.stage.layout_grid" : "voice.stage.layout_free")}
            </button>
            {freeLayout.mode === "free" && (
              <button type="button" className="btn-small btn-secondary" onClick={() => setFreeLayout({ ...freeLayout, top: freeLayout.top === "people" ? "lives" : "people" })}>
                {t(freeLayout.top === "people" ? "voice.stage.top_lives" : "voice.stage.top_people")}
              </button>
            )}
          </div>
          <div className={`voice-stage-area${liveOnStage ? " has-live" : ""}`} ref={stageRef} style={stageHeight ? { height: stageHeight, flex: "none" } : undefined}>
            {freeLayout.mode === "free" ? (
              <FreeStage
                layout={freeLayout}
                onChange={setFreeLayout}
                items={[
                  ...(selfShare || opened
                    ? [{
                        id: LIVES_ITEM,
                        layer: "lives" as const,
                        node: (
                          <div className="free-lives">
                            {selfShare && (
                              <SelfShareTile
                                stream={selfShare.stream}
                                onStop={selfShare.onStop}
                                label={t("voice.stage.you_share")}
                                stopLabel={t("voice.screen_share.stop")}
                                sent={t("voice.stage.sending", { mbps: (selfShare.kbps / 1000).toFixed(1) })}
                              />
                            )}
                            {children}
                          </div>
                        ),
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
              <div className="voice-stage-lives">
                {selfShare && (
                  <SelfShareTile
                    stream={selfShare.stream}
                    onStop={selfShare.onStop}
                    label={t("voice.stage.you_share")}
                    stopLabel={t("voice.screen_share.stop")}
                    sent={t("voice.stage.sending", { mbps: (selfShare.kbps / 1000).toFixed(1) })}
                  />
                )}
                {children}
              </div>
            )}
            {onStage.length > 0 && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onStageDragEnd}>
                <SortableContext items={onStage.map((p) => p.public_key)} strategy={rectSortingStrategy}>
                  <ul className="voice-tiles stage">
                    {onStage.map((p) => (
                      <SortableStageTile key={p.public_key} id={p.public_key}>
                        {(handle) => personTile(p, 96, handle)}
                      </SortableStageTile>
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
          <p className="muted">{t("voice.stage.empty")}</p>
        ) : (
          <>
            <div className="voice-audience-head">
              {hasStage && <span className="voice-audience-label">{t("voice.stage.audience", { count: audience.length })}</span>}
              {audience.length > 8 && (
                <input
                  type="search"
                  value={query}
                  placeholder={t("voice.stage.search")}
                  aria-label={t("voice.stage.search")}
                  onChange={(e) => setQuery(e.target.value)}
                />
              )}
              {hasStage && (
                <button type="button" className="btn-small btn-secondary" aria-expanded={!audienceCollapsed} onClick={() => setAudienceCollapsed((v) => !v)}>
                  {t(audienceCollapsed ? "voice.stage.expand" : "voice.stage.collapse")}
                </button>
              )}
            </div>
            {/* With no stage the room is everyone, so the tiles take the room. */}
            <ul className={`voice-tiles audience size-${tileSize}${audienceCollapsed ? " collapsed" : ""}${hasStage ? "" : " roomy"}`}>{shown.map((p) => personTile(p, tileAvatar))}</ul>
          </>
        )}
      </div>

      {!inThisRoom && (
        <div className="settings-row voice-room-join">
          <button className="btn-primary" onClick={onJoin}>{t("voice.stage.join")}</button>
          <span className="muted hint-fine">{t("voice.stage.join_hint")}</span>
        </div>
      )}
      {inThisRoom && floor && !floor.maySpeak && (
        <div className="settings-row voice-room-join">
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
      {/* One floating dock for the room's media controls (share, camera,
          whisper, soundboard); mic, deafen and leave live in the sidebar. */}
      {inThisRoom && <div className="voice-room-controls voice-dock" ref={barRef} />}
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
