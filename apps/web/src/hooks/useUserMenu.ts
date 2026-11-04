import { useEffect, useState } from "react";
import { formatPubkey } from "@wavvon/core";
import type { MenuAccount, UserMenuProps, usePresenceStatus } from "@wavvon/ui";
import { listAccountsOrdered, getActiveAccountId, switchAccount } from "@identity/index";
import type { User } from "@shared/types";

/** The props of the avatar menu: who this is, presence, settings, accounts. */
export function useUserMenu({ users, publicKey, presence, onOpenSettings, onOpenShortcuts, settingsNeedsAttention }: {
  users: User[];
  publicKey: string | null;
  presence: ReturnType<typeof usePresenceStatus>;
  onOpenSettings: (tab?: string) => void;
  onOpenShortcuts: () => void;
  settingsNeedsAttention?: boolean;
}): UserMenuProps {
  const [accounts, setAccounts] = useState<MenuAccount[]>([]);
  useEffect(() => {
    const active = getActiveAccountId();
    listAccountsOrdered()
      .then((rs) => setAccounts(rs.map((r) => ({
        id: r.id,
        name: r.account_label || formatPubkey(r.canonical_pubkey ?? r.id),
        active: r.id === active,
      }))))
      .catch(() => { /* the menu shows no account list */ });
  }, []);
  const me = users.find((u) => u.public_key === publicKey);
  return {
    name: me?.display_name || formatPubkey(publicKey ?? ""),
    publicKey,
    avatar: me?.avatar,
    status: presence.myPresence.status,
    customStatus: presence.myPresence.custom,
    onSetStatus: presence.handleSetStatus,
    onSetCustomStatus: presence.handleSetCustomStatus,
    onOpenSettings,
    settingsNeedsAttention,
    accounts,
    // A refusal (in voice, too soon) is explained on the accounts tab.
    onSwitchAccount: (id) => { if (switchAccount(id, "settings-account")) onOpenSettings("accounts"); },
    onAddAccount: () => onOpenSettings("accounts"),
    onOpenShortcuts,
  };
}
