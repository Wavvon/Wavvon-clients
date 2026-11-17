/** Voice messages: a recording uploaded as an ordinary attachment, recognised
 *  by its name so any client shows the player. */

export const VOICE_MAX_MS = 5 * 60_000;
/** A press shorter than this is a tap, not a recording. */
export const VOICE_MIN_MS = 600;
/** Opus at speech quality: five minutes is about 1.2 MB, far under any hub's limit. */
export const VOICE_BITS_PER_SECOND = 32_000;

const VOICE_NAME = /^voice-message-\d+\.(ogg|webm)$/;

/** The recorder format: Ogg Opus where the browser records it, else WebM Opus. */
export function pickVoiceMime(supported: (mime: string) => boolean): string | null {
  for (const m of ["audio/ogg;codecs=opus", "audio/webm;codecs=opus"]) if (supported(m)) return m;
  return null;
}

export function voiceFileName(mime: string, now: number = Date.now()): string {
  return `voice-message-${now}.${mime.startsWith("audio/ogg") ? "ogg" : "webm"}`;
}

export function isVoiceMessage(name: string): boolean {
  return VOICE_NAME.test(name);
}

/** `count` bar heights in 0..1: the peak of each slice, scaled to the loudest. */
export function waveformPeaks(samples: Float32Array, count: number): number[] {
  const out: number[] = [];
  const size = Math.max(1, Math.floor(samples.length / count));
  for (let i = 0; i < count; i++) {
    let peak = 0;
    const end = Math.min(samples.length, (i + 1) * size);
    for (let j = i * size; j < end; j++) peak = Math.max(peak, Math.abs(samples[j]));
    out.push(peak);
  }
  const max = Math.max(...out, 1e-6);
  return out.map((p) => p / max);
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
