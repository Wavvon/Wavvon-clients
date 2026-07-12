import type { IdentityRecord } from "@identity/index";

// Which account AccountTab's "Managing" selector defaults its per-account
// sections to. Prefers an explicit selection, falls back to the active
// account, then the first account in the list — pulled out of AccountTab.tsx
// (a React component that transitively imports the full @wavvon/ui barrel)
// so this default-resolution rule is unit-testable on its own.
export function resolveManagingAccount(
  accounts: IdentityRecord[] | null,
  managingId: string | null,
  activeId: string | null,
): IdentityRecord | null {
  if (!accounts || accounts.length === 0) return null;
  return (
    (managingId && accounts.find((a) => a.id === managingId)) ||
    accounts.find((a) => a.id === activeId) ||
    accounts[0] ||
    null
  );
}
