import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { VoiceParticipant } from "../../types";
import { Avatar } from "../Avatar";

/** The room's spatial map (proximity-voice.md): a voice zone the room's
 *  members place themselves in, so a voice fades with distance. */
export interface VoiceRoomMapInfo {
  /** The map that is on in this room, if any. Positions run 0..100 on both axes. */
  zone: { zoneId: string; positions: Record<string, number[]> } | null;
  /** Hub-level `channels.manage`, which the hub asks for to create a zone. */
  canManage: boolean;
  onEnable: () => void;
  onDisable: () => void;
  onMove: (position: [number, number]) => void;
  /** Title of a mini-app that is moving the user; the map takes no input meanwhile. */
  movedBy?: string | null;
  /** The hub just refused a move; the dot is back where it last accepted one. */
  refused?: boolean;
}

/** How a voice carries on the map (0..100 square): full volume within
 *  `ref_dist`, fading to silence at `max_radius`, so a neighbour a few
 *  steps away still sounds close and the far corner is quiet. */
export const ROOM_MAP_ATTENUATION = { model: "step", ref_dist: 25, max_radius: 100, rolloff: 1 } as const;
const STEP = 5;
/** The hub refuses position updates closer than 30 ms apart. */
const DRAG_INTERVAL_MS = 50;

/** Where someone stands on walking in: around the centre, spread by key so
 *  newcomers do not sit on top of each other. */
export function arrivalSpot(publicKey: string): [number, number] {
  const angle = (parseInt(publicKey.slice(0, 4), 16) || 0) / 0x10000 * 2 * Math.PI;
  return [Math.round(50 + 18 * Math.cos(angle)), Math.round(50 + 18 * Math.sin(angle))];
}

interface Props {
  room: VoiceRoomMapInfo;
  participants: VoiceParticipant[];
  avatars: Map<string, string | null>;
  publicKey?: string | null;
}

export function VoiceRoomMap({ room, participants, avatars, publicKey }: Props) {
  const { t } = useTranslation();
  const { zone } = room;

  const mine = publicKey && zone ? zone.positions[publicKey] : undefined;
  const dragging = useRef(false);
  const lastSent = useRef(0);
  const pending = useRef<[number, number] | null>(null);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (trailing.current) clearTimeout(trailing.current); }, []);

  // Everyone is on the map from the moment it is on: a member who never
  // placed themselves would hear everyone at full volume and be invisible.
  const placedIn = useRef<string | null>(null);
  const zoneId = zone?.zoneId ?? null;
  useEffect(() => {
    if (!zoneId || !publicKey || mine || room.movedBy || placedIn.current === zoneId) return;
    placedIn.current = zoneId;
    room.onMove(arrivalSpot(publicKey));
  }, [zoneId, publicKey, mine, room]);

  // Off, the map is one button in the room's dock (VoiceStage).
  if (!zone) return null;

  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  function at(e: React.PointerEvent<HTMLDivElement>): [number, number] {
    const r = e.currentTarget.getBoundingClientRect();
    return [clamp(((e.clientX - r.left) / r.width) * 100), clamp(((e.clientY - r.top) / r.height) * 100)];
  }
  function send(pos: [number, number], force = false) {
    const now = performance.now();
    if (!force && now - lastSent.current < DRAG_INTERVAL_MS) {
      pending.current = pos;
      // Where the pointer came to rest still goes out, not only on release.
      trailing.current ??= setTimeout(() => {
        trailing.current = null;
        if (pending.current) send(pending.current, true);
      }, DRAG_INTERVAL_MS);
      return;
    }
    lastSent.current = now;
    pending.current = null;
    room.onMove(pos);
  }
  function handleDown(e: React.PointerEvent<HTMLDivElement>) {
    if (room.movedBy) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    send(at(e), true);
  }
  function handleMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragging.current) send(at(e));
  }
  function handleUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    dragging.current = false;
    send(pending.current ?? at(e), true);
  }

  function handleKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (room.movedBy) return;
    const [x, y] = mine ?? [50, 50];
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    room.onMove([clamp(x + d[0]), clamp(y + d[1])]);
  }

  return (
    <div className="voice-room-map-wrap">
      <div className="voice-room-map-head">
        {room.refused && <span className="error-text" role="status">{t("voice.room_map.refused")}</span>}
        <span className="muted">
          {room.movedBy
            ? t("voice.room_map.moved_by", { app: room.movedBy })
            : mine ? t("voice.room_map.hint") : t("voice.room_map.place_yourself")}
        </span>
        {room.canManage && (
          <button type="button" className="btn-small btn-secondary" onClick={room.onDisable}>
            {t("voice.room_map.disable")}
          </button>
        )}
      </div>
      <div
        className="voice-room-map"
        role="application"
        tabIndex={0}
        aria-label={t("voice.room_map.label")}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onKeyDown={handleKey}
      >
        {participants.map((p) => {
          const pos = zone.positions[p.public_key];
          if (!pos || pos.length < 2) return null;
          const name = p.display_name || p.public_key.slice(0, 8);
          return (
            <span
              key={p.public_key}
              className={`voice-room-map-dot${p.public_key === publicKey ? " is-me" : ""}`}
              style={{ left: `${pos[0]}%`, top: `${pos[1]}%` }}
              title={name}
            >
              <Avatar src={avatars.get(p.public_key) ?? null} name={name} size={28} />
            </span>
          );
        })}
      </div>
    </div>
  );
}
