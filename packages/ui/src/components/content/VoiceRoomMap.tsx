import React from "react";
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
}

/** How far a voice carries on the map, in map units (the zone's `max_radius`). */
export const ROOM_MAP_RADIUS = 60;
const STEP = 5;

interface Props {
  room: VoiceRoomMapInfo;
  participants: VoiceParticipant[];
  avatars: Map<string, string | null>;
  publicKey?: string | null;
}

export function VoiceRoomMap({ room, participants, avatars, publicKey }: Props) {
  const { t } = useTranslation();
  const { zone } = room;

  if (!zone) {
    return room.canManage ? (
      <div className="voice-room-map-off">
        <button type="button" className="btn-small btn-secondary" onClick={room.onEnable}>
          {t("voice.room_map.enable")}
        </button>
      </div>
    ) : null;
  }

  const mine = publicKey ? zone.positions[publicKey] : undefined;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    room.onMove([clamp(((e.clientX - r.left) / r.width) * 100), clamp(((e.clientY - r.top) / r.height) * 100)]);
  }

  function handleKey(e: React.KeyboardEvent<HTMLDivElement>) {
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
        <span className="muted">{mine ? t("voice.room_map.hint") : t("voice.room_map.place_yourself")}</span>
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
        onClick={handleClick}
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
