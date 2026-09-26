// Handing an identity from a hub build to the user build (decisions.md
// 2026-08-25, "Two web clients: one per hub, one per user").
//
// Two windows the user opened themselves pass a payload. Not shared storage —
// nothing here reads the other origin's IndexedDB, which is exactly what
// browsers stopped allowing. And not a URL: a seed in a query or a fragment
// lands in history, in the referrer and in logs, which is the whole reason
// this is a message and not a link. The *early* handoff, which carries only a
// hub URL and an invite code, is a plain link precisely because it carries no
// secret.
//
// Both sides validate before acting. The receiver must additionally check
// `event.origin` and show it to the user: a well-formed offer proves nothing
// about who sent it, and silently importing one would let any page push an
// identity — or a hostile hub — into someone's client.

export const HANDOVER_VERSION = 1;

/** Receiver → sender. Carries nothing: it only says "I am loaded, and this
 *  is my origin", so it is safe to post with a `*` target. Every reply is
 *  addressed to the origin this arrived from. */
export interface HandoverReady {
  v: number;
  type: "wavvon:handover-ready";
}

/** Sender → receiver, addressed to the receiver's exact origin. */
export interface HandoverOffer {
  v: number;
  type: "wavvon:handover-offer";
  /** The hub the sender is served from. */
  hub_url: string;
  /** Present when the sender arrived through an invite worth carrying over. */
  invite_code?: string;
  /** The master seed, when the user chose to bring the identity itself.
   *  Absent means "just add this hub to whatever identity you have there". */
  seed_hex?: string;
}

/** Receiver → sender, after the user confirmed and the hub was added. The
 *  sender uses it to wipe its local copy: the handover is a move, not a copy,
 *  or the same person ends up as two users on one hub. */
export interface HandoverDone {
  v: number;
  type: "wavvon:handover-done";
  /** Which identity the receiver ended up on, so the sender wipes that one
   *  and not whichever account happens to be active. */
  pubkey: string;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isCurrentVersion(x: Record<string, unknown>, type: string): boolean {
  return x.v === HANDOVER_VERSION && x.type === type;
}

const HEX64 = /^[0-9a-f]{64}$/i;
/** Loose on purpose — hubs mint their own codes and we are not the authority
 *  on their shape. This only keeps a pathological string out of a URL. */
const INVITE_CODE = /^[A-Za-z0-9_-]{1,128}$/;

/** http(s) only, and no credentials, query or fragment — this becomes a hub
 *  URL the client connects to, not something to render. */
export function isSafeHubUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  return (
    (u.protocol === "https:" || u.protocol === "http:") &&
    !u.username &&
    !u.password &&
    !u.search &&
    !u.hash
  );
}

export function isHandoverReady(x: unknown): x is HandoverReady {
  return isRecord(x) && isCurrentVersion(x, "wavvon:handover-ready");
}

export function isHandoverOffer(x: unknown): x is HandoverOffer {
  if (!isRecord(x) || !isCurrentVersion(x, "wavvon:handover-offer")) return false;
  if (!isSafeHubUrl(x.hub_url)) return false;
  if (x.invite_code !== undefined && (typeof x.invite_code !== "string" || !INVITE_CODE.test(x.invite_code))) {
    return false;
  }
  // A malformed seed must never reach the crypto: reject the whole offer
  // rather than dropping the field, so the user is not silently handed a
  // "joined, but your identity did not come with you".
  if (x.seed_hex !== undefined && (typeof x.seed_hex !== "string" || !HEX64.test(x.seed_hex))) {
    return false;
  }
  return true;
}

export function isHandoverDone(x: unknown): x is HandoverDone {
  return (
    isRecord(x) &&
    isCurrentVersion(x, "wavvon:handover-done") &&
    typeof x.pubkey === "string" &&
    HEX64.test(x.pubkey)
  );
}

export function handoverReady(): HandoverReady {
  return { v: HANDOVER_VERSION, type: "wavvon:handover-ready" };
}

export function handoverOffer(fields: Omit<HandoverOffer, "v" | "type">): HandoverOffer {
  return { v: HANDOVER_VERSION, type: "wavvon:handover-offer", ...fields };
}

export function handoverDone(pubkey: string): HandoverDone {
  return { v: HANDOVER_VERSION, type: "wavvon:handover-done", pubkey };
}
