import i18n from "@wavvon/i18n";
import { voiceTransportFailure } from "@wavvon/ui";
import { HubApiError } from "./http";

/** The voice transport never became ready. `elapsedMs` is from `new
 *  WebTransport()` to the failure, which is what tells the cases apart. */
export class VoiceTransportError extends Error {
  constructor(
    readonly url: string,
    readonly reason: string,
    readonly detail: string,
    readonly elapsedMs: number,
  ) {
    super(`Voice transport to ${url} failed after ${elapsedMs} ms: ${reason}${detail ? ` (${detail})` : ""}`);
    this.name = "VoiceTransportError";
  }
}

export type VoiceFailure = "transport" | "join_timeout" | "join_refused" | "other";

export function classifyVoiceFailure(e: unknown): VoiceFailure {
  if (e instanceof VoiceTransportError) return "transport";
  if (e instanceof HubApiError) return "join_refused";
  if (e instanceof Error && e.message === VOICE_JOIN_TIMEOUT) return "join_timeout";
  return "other";
}

export const VOICE_JOIN_TIMEOUT = "Voice join timed out";

/** A translated sentence saying what happened and who can fix it. The
 *  technical detail goes to the console, where an operator can ask for it. */
export function voiceErrorMessage(e: unknown): string {
  console.warn("[voice]", e);
  switch (classifyVoiceFailure(e)) {
    case "transport": {
      const { key, params } = voiceTransportFailure((e as VoiceTransportError).url, (e as VoiceTransportError).elapsedMs);
      return i18n.t(key, params);
    }
    case "join_refused":
      return i18n.t("voice.error.join_refused", { reason: (e as HubApiError).message });
    case "join_timeout":
      return i18n.t("voice.error.join_timeout");
    default:
      return i18n.t("voice.error.generic");
  }
}
