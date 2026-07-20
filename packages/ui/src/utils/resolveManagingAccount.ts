import type { ProfileAccountRef } from "../types";

// Which account a settings tab's "Managing" selector defaults its
// per-account sections to. Prefers an explicit selection, falls back to the
// active account, then the first account in the list. Generic over the
// platform's own account shape (see PerAccountProps in types.ts).
export function resolveManagingAccount<TAccount extends ProfileAccountRef>(
  accounts: TAccount[] | null,
  managingId: string | null,
  activeId: string | null,
): TAccount | null {
  if (!accounts || accounts.length === 0) return null;
  return (
    (managingId && accounts.find((a) => a.id === managingId)) ||
    accounts.find((a) => a.id === activeId) ||
    accounts[0] ||
    null
  );
}
