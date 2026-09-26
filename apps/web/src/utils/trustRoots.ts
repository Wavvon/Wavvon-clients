import { parseTrustRoots, serializeTrustRoots, type TrustRoot } from "@wavvon/ui";
import { getScoped, setScoped } from "./accountScope";

// Where this browser keeps the viewer's trust roots (server-tags.md Part 4).
//
// Account-scoped, and in `SYNCED_KEYS`, so it follows the identity rather than
// the machine: whom you believe is a choice about yourself, and a trust list
// that vanished when you opened another browser would silently downgrade every
// badge back to "(unknown issuer)" with no explanation.

const KEY = "wavvon.trustedIssuers";

export function loadTrustRoots(): TrustRoot[] {
  try {
    return parseTrustRoots(getScoped(KEY));
  } catch {
    return [];
  }
}

export function saveTrustRoots(roots: TrustRoot[]): void {
  try {
    setScoped(KEY, serializeTrustRoots(roots));
  } catch {
    // storage unavailable — the list is a preference, not state anything
    // depends on; rendering falls back to "no relationship", which is the
    // truthful answer when we cannot read what the viewer chose.
  }
}
