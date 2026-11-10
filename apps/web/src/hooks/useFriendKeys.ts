import { useEffect, useState } from "react";
import { listFriends } from "@platform";

/** Your friends' pubkeys, read again whenever `refreshKey` changes (the room
 *  on screen): the voice audience puts them first. A failed read leaves the
 *  previous set, since ordering is a convenience, not a gate. */
export function useFriendKeys(refreshKey: unknown): Set<string> {
  const [keys, setKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    listFriends()
      .then((friends) => { if (!cancelled) setKeys(new Set(friends.map((f) => f.public_key))); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [refreshKey]);
  return keys;
}
