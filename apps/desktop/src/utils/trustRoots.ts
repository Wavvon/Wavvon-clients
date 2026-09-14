import { parseTrustRoots, serializeTrustRoots, type TrustRoot } from "@wavvon/ui";

// Where this install keeps the viewer's trust roots (server-tags.md Part 4).
//
// The shared `ProfileTab` omits the "trust this issuer" affordance when a
// platform has nowhere to keep the answer, and desktop had nowhere — so every
// badge read "(unknown issuer)" with no way to change that. The webview's own
// storage is somewhere: it survives restarts and belongs to this install,
// which is the same shape the web client's copy has.
//
// Whom you believe is a choice about yourself, so it is keyed by account: two
// identities on one machine do not share a trust list.
const KEY = "wavvon.trustedIssuers";

function keyFor(accountId: string | null | undefined): string {
  return accountId ? `${KEY}.${accountId}` : KEY;
}

export function loadTrustRoots(accountId: string | null | undefined): TrustRoot[] {
  try {
    return parseTrustRoots(localStorage.getItem(keyFor(accountId)));
  } catch {
    return [];
  }
}

export function saveTrustRoots(accountId: string | null | undefined, roots: TrustRoot[]): void {
  try {
    localStorage.setItem(keyFor(accountId), serializeTrustRoots(roots));
  } catch {
    // Storage unavailable — the list is a preference, not state anything
    // depends on; rendering falls back to "no relationship", which is the
    // truthful answer when we cannot read what the viewer chose.
  }
}
