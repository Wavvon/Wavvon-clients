import type { IdentityRecord } from "@identity/index";

// Props shared by every tab that can act on a non-active local account.
// State is owned by SettingsPage so the selection survives tab changes.
export interface PerAccountProps {
  accounts: IdentityRecord[] | null;
  activeId: string | null;
  managing: IdentityRecord | null;
  onManagingChange: (id: string) => void;
}
