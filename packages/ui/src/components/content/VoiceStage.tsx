import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { VoiceParticipant } from "../../types";
import { Avatar } from "../Avatar";
import { LiveTray, type VoiceLive } from "./LiveTray";
import { VoiceRoomMap, type VoiceRoomMapInfo } from "./VoiceRoomMap";
import { setVoiceBarSlot } from "../../utils/voiceBarSlot";
import { PinIcon, ExpandIcon } from "../Icons";
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
  participants, friends, speaking, avatars, inThisRoom, onJoin, publicKey, floor, live, selfShare, room, children,
}: VoiceStageInfo & { children?: React.ReactNode }) {
  const { t } = useTranslation();
  const [pins, setPins] = useState<string[]>(loadPins);
  const [big, setBig] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [stageHeight, setStageHeight] = useState<number | null>(null);
  const roomRef = useRef<HTMLElement>(null);

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
  const hasStage = onStage.length > 0 || opened || !!selfShare;
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

  function personTile(p: VoiceParticipant, size: number, sortable?: SortableHandle) {
    const name = p.display_name || p.public_key.slice(0, 12);
    const handUp = !!floor?.hands.includes(p.public_key);
    const pinned = pins.includes(p.public_key);
    return (
      <li
        key={p.public_key}
        className={`voice-tile${speaking.has(p.public_key) ? " speaking" : ""}${big === p.public_key ? " big" : ""}`}
        title={p.public_key}
        ref={sortable?.setNodeRef}
        style={sortable?.style}
        {...sortable?.attributes}
        {...sortable?.listeners}
        aria-roledescription={sortable ? t("voice.stage.sortable") : undefined}
      >
        <Avatar src={avatars.get(p.public_key)} name={name} pubkey={p.public_key} size={size} />
        <span className="voice-tile-name">
          {sharing.has(p.public_key) && <span className="live-badge">LIVE</span>}{" "}
          {handUp && <span className="voice-stage-hand" role="img" aria-label={t("voice.stage.hand_raised")}>✋ </span>}
          {name}
        </span>
        <div className="voice-tile-actions">
          <button
            type="button"
            className="btn-icon"
            aria-pressed={pinned}
            aria-label={t(pinned ? "voice.stage.unpin" : "voice.stage.pin", { name })}
            title={t(pinned ? "voice.stage.unpin" : "voice.stage.pin", { name })}
            onClick={() => togglePin(p.public_key)}
          >
            <PinIcon size={13} />
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
    <section className="voice-room" ref={roomRef} aria-label={t("voice.stage.label")}>
      <div className="voice-room-bar">
        {live && <LiveTray {...live} />}
        {inThisRoom && <div className="voice-room-controls" ref={barRef} />}
      </div>

      {hasStage && (
        <>
          <div className="voice-stage-area" style={stageHeight ? { height: stageHeight, flex: "none" } : undefined}>
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
            </div>
            <ul className="voice-tiles audience">{shown.map((p) => personTile(p, 56))}</ul>
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
