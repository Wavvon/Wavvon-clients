export interface VoiceBridgeZone {
  zone_id: string;
  coordinate_system: string;
}

export interface VoiceBridgeState {
  /** True only while the user is in voice in the mini-app's own channel. */
  inVoice: boolean;
  zones: VoiceBridgeZone[];
}

export type VoicePositionRefusal = "not_in_voice" | "no_zone" | "ambiguous_zone" | "bad_position";

export type VoicePositionRequest =
  | { ok: true; zoneId: string; position: number[] }
  | { ok: false; reason: VoicePositionRefusal };

export const SET_VOICE_POSITION = "wavvon:setVoicePosition";

export function isSetVoicePosition(data: unknown): boolean {
  return typeof data === "object" && data !== null && (data as { type?: unknown }).type === SET_VOICE_POSITION;
}

/** A request counts only when it comes from the frame this client opened,
 *  from the origin of the mini-app URL. */
export function isFromFrame(
  event: { source: unknown; origin: string },
  frameWindow: unknown,
  appOrigin: string,
): boolean {
  return !!frameWindow && event.source === frameWindow && event.origin === appOrigin;
}

/** The message names no pubkey: it can only ever move the user's own place. */
export function checkSetVoicePosition(data: unknown, state: VoiceBridgeState): VoicePositionRequest {
  if (!state.inVoice) return { ok: false, reason: "not_in_voice" };
  const m = (data ?? {}) as { zone_id?: unknown; position?: unknown };
  let zone: VoiceBridgeZone | undefined;
  if (m.zone_id !== undefined) {
    zone = state.zones.find((z) => z.zone_id === m.zone_id);
  } else if (state.zones.length > 1) {
    return { ok: false, reason: "ambiguous_zone" };
  } else {
    zone = state.zones[0];
  }
  if (!zone) return { ok: false, reason: "no_zone" };
  const p = m.position;
  const arity = zone.coordinate_system === "3d" ? 3 : 2;
  if (!Array.isArray(p) || p.length !== arity || !p.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return { ok: false, reason: "bad_position" };
  }
  return { ok: true, zoneId: zone.zone_id, position: p as number[] };
}

export function voiceStateMessage(state: VoiceBridgeState) {
  return { type: "wavvon:voiceState", v: 1, in_voice: state.inVoice, zones: state.zones };
}

export function voiceRefusedMessage(reason: VoicePositionRefusal) {
  return { type: "wavvon:voicePositionRefused", v: 1, reason };
}

export interface PositionCoalescer {
  push(zoneId: string, position: number[]): void;
  cancel(): void;
}

/** At most one send per `intervalMs`; the latest position always goes out,
 *  as a trailing send when it arrived inside the window. */
export function createPositionCoalescer(
  send: (zoneId: string, position: number[]) => void,
  intervalMs = 50,
  now: () => number = Date.now,
): PositionCoalescer {
  let lastSent = -Infinity;
  let pending: { zoneId: string; position: number[] } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    timer = null;
    if (!pending) return;
    const { zoneId, position } = pending;
    pending = null;
    lastSent = now();
    send(zoneId, position);
  }

  return {
    push(zoneId, position) {
      pending = { zoneId, position };
      if (timer) return;
      const wait = lastSent + intervalMs - now();
      if (wait <= 0) flush();
      else timer = setTimeout(flush, wait);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}
