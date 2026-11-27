import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Blocked users: pubkey set. Persisted to ~/.wavvon/blocked_users.json so
 *  the choice carries across sessions. Used to filter out their messages
 *  from channel + DM views without involving any hub state. */
export function useBlockedUsers() {
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());

  function toggleBlockUser(pubkey: string) {
    setBlockedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(pubkey)) next.delete(pubkey);
      else next.add(pubkey);
      const list = Array.from(next);
      invoke("save_blocked_users", { blocked: list }).catch(() => {});
      invoke("update_dm_blocks", { blocked: list }).catch(() => {});
      return next;
    });
  }

  useEffect(() => {
    invoke<string[]>("load_blocked_users")
      .then((s) => setBlockedUsers(new Set(s ?? [])))
      .catch(console.error);
  }, []);

  return { blockedUsers, toggleBlockUser };
}
