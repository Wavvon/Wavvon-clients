import { useEffect, useState } from "react";
import { loadIdentity } from "@identity/index";

// The active account's user-set label, for settings sections that need to
// say whose data they're showing (home hubs, devices, passkeys, trusted
// devices, blocked/ignored users — each is per-account). Null for accounts
// created before labels were mandatory, or while identity is still loading.
export function useActiveAccountLabel(): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadIdentity().then((rec) => {
      if (!cancelled) setLabel(rec?.account_label ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return label;
}
