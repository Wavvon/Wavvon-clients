import { useEffect, useState } from "react";
import { formatPubkey } from "@wavvon/core";
import type { MenuAccount, PresenceStatus, UserMenuProps } from "@wavvon/ui";
import { listAccounts, switchAccountGuarded } from "../accounts/store";
import type { User } from "../types";

/** The props of the avatar menu: who this is, presence, settings, accounts. */
export function useUserMenu({ users, publicKey, presence, onSetStatus, onSetCustomStatus, onOpenSettings, onOpenShortcuts }: {
  users: User[];
  publicKey: string | null;
  presence: { status: PresenceStatus; custom: string | null };
  onSetStatus: (status: PresenceStatus, ttlMinutes: number | null) => void;
  onSetCustomStatus: (text: string) => void;
  onOpenSettings: (tab?: string) => void;
  onOpenShortcuts: () => void;
}): UserMenuProps {
  const [accounts, setAccounts] = useState<MenuAccount[]>([]);
  useEffect(() => {
    listAccounts()
      .then((rs) => setAccounts(rs.map((r) => ({ id: r.id, name: r.label || formatPubkey(r.id), active: r.is_active }))))
      .catch(() => { /* the menu shows no account list */ });
  }, []);
  const me = users.find((u) => u.public_key === publicKey);
  return {
    name: me?.display_name || formatPubkey(publicKey ?? ""),
    publicKey,
    avatar: me?.avatar,
    status: presence.status,
    customStatus: presence.custom,
    onSetStatus,
    onSetCustomStatus,
    onOpenSettings,
    accounts,
    // A refusal (in voice, too soon) is explained on the accounts tab.
    onSwitchAccount: (id) => { void switchAccountGuarded(id).then((refused) => { if (refused) onOpenSettings("accounts"); }); },
    onAddAccount: () => onOpenSettings("accounts"),
    onOpenShortcuts,
  };
}
