import { useState } from "react";
import { updateDmBlocks, HubApiError } from "@platform";
import { getScoped, setScoped } from "../utils/accountScope";

/** Block list (hub-side, seeded by loadHubData through `setBlockedUsers`) and
 *  ignore list (per-account local storage). */
export function useBlockIgnore(showHubError: (msg: string) => void) {
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());
  const [ignoredUsers, setIgnoredUsers] = useState<Set<string>>(() => {
    try {
      const raw = getScoped("wavvon.ignoredUsers");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });

  function toggleBlockUser(pubkey: string) {
    const prev = blockedUsers;
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

  function toggleIgnoreUser(pubkey: string) {
    setIgnoredUsers((prev) => {
      const next = new Set(prev);
      if (next.has(pubkey)) next.delete(pubkey);
      else next.add(pubkey);
      try { setScoped("wavvon.ignoredUsers", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  }

  return { blockedUsers, setBlockedUsers, ignoredUsers, toggleBlockUser, toggleIgnoreUser };
}
