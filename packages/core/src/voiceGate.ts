// "Your mic is below your voice-activity threshold" detection, shared by both
// clients: they gate transmission on the same RMS-versus-threshold rule, so
// they must also agree on when that gate has been silently closed for too long.

/** Absolute floor for "this is a signal, not the room": about -40 dBFS, above
 *  typical room noise and well under quiet speech. Capped at half the
 *  threshold so a deliberately low threshold still has a band to warn in. */
export const SUB_GATE_SIGNAL_FLOOR = 0.01;

/** How long the mic must sit between floor and threshold before we say so. */
export const SUB_GATE_WARN_MS = 4000;

/** Dips under the floor shorter than this (pauses between words) do not
 *  restart the clock. */
export const SUB_GATE_GRACE_MS = 1000;

export interface SubGateState {
  /** When the current run of sub-threshold signal began, or null. */
  since: number | null;
  lastSignalAt: number;
  warning: boolean;
}

export const INITIAL_SUB_GATE_STATE: SubGateState = { since: null, lastSignalAt: 0, warning: false };

export interface SubGateInput {
  energy: number;
  now: number;
  /** False when the profile has no gate (music, custom VAD off). */
  vadEnabled: boolean;
  threshold: number;
  muted: boolean;
}

export function nextSubGateState(prev: SubGateState, i: SubGateInput): SubGateState {
  if (!i.vadEnabled || i.muted || i.energy >= i.threshold) {
    return prev === INITIAL_SUB_GATE_STATE ? prev : INITIAL_SUB_GATE_STATE;
  }
  const floor = Math.min(SUB_GATE_SIGNAL_FLOOR, i.threshold / 2);
  let { since, lastSignalAt } = prev;
  if (i.energy >= floor) {
    since ??= i.now;
    lastSignalAt = i.now;
  } else if (since !== null && i.now - lastSignalAt > SUB_GATE_GRACE_MS) {
    return INITIAL_SUB_GATE_STATE;
  }
  const warning = since !== null && i.now - since >= SUB_GATE_WARN_MS;
  if (since === prev.since && lastSignalAt === prev.lastSignalAt && warning === prev.warning) return prev;
  return { since, lastSignalAt, warning };
}
