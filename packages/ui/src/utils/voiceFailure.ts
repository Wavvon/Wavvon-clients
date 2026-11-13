/** A QUIC handshake that gets no answer gives up after a few seconds (about
 *  4 s in Chromium and in wtransport); a refused one fails well under a
 *  second. A client cannot tell "UDP blocked" from "server down", so the
 *  slow case is worded as likely causes, not a diagnosis. */
export const VOICE_UNREACHABLE_AFTER_MS = 3000;

/** i18n key and params for a voice transport that never became ready. */
export function voiceTransportFailure(url: string, elapsedMs: number): { key: string; params: { host: string } } {
  let host = "";
  try { host = new URL(url).host; } catch { /* keep it blank */ }
  return {
    key: elapsedMs >= VOICE_UNREACHABLE_AFTER_MS ? "voice.error.unreachable" : "voice.error.refused",
    params: { host },
  };
}
