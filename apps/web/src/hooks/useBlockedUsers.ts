import { useRef, useState } from "react";
import { updateDmBlocks, HubApiError } from "@platform";

/** Block list (hub-side, seeded by loadHubData through `setBlockedUsers`). */
export function useBlockedUsers(showHubError: (msg: string) => void) {
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());
  // An Undo toast calls an older render's toggle, which must still see the current set.
  const blockedRef = useRef(blockedUsers);
  blockedRef.current = blockedUsers;

  function toggleBlockUser(pubkey: string) {
    const prev = blockedRef.current;
    const next = new Set(prev);
    if (next.has(pubkey)) next.delete(pubkey);
    else next.add(pubkey);
    setBlockedUsers(next);
    // Optimistic update; on failure revert and say so — a silently
    // unpersisted block is a safety problem, not a cosmetic one.
    updateDmBlocks(Array.from(next)).catch((e) => {
      setBlockedUsers(prev);
      showHubError(e instanceof HubApiError ? e.message : String(e));
    });
  }

  return { blockedUsers, setBlockedUsers, toggleBlockUser };
}
