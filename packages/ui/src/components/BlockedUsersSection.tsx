import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey, formatDate } from "@wavvon/core";
import type { BlockEntry } from "../types";
import { SettingRow } from "./SettingRow";

interface Props {
  blocks: BlockEntry[];
  onUnblock: (pubkey: string) => void;
  knownNames: Record<string, string | null>;
  // Active account's label (desktop leaves this unset — single-account today).
  accountLabel?: string | null;
}

export function BlockedUsersSection({ blocks, onUnblock, knownNames }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <SettingRow
      title={t("settings.account.blocked_users.title")}
      state={blocks.length === 0
        ? t("settings.account.blocked_users.empty")
        : t("settings.account.blocked_users.state", { count: blocks.length })}
      meta={blocks.length > 0 ? String(blocks.length) : undefined}
      open={open}
      onToggle={() => setOpen((cur) => !cur)}
    >
      <p className="muted">{t("settings.account.blocked_users.hint")}</p>
      {blocks.map((b) => (
        <div key={b.pubkey} className="settings-row">
          <div>
            <span>{knownNames[b.pubkey] || formatPubkey(b.pubkey)}</span>
            <span className="muted" style={{ marginLeft: 8, fontSize: "var(--text-xs)" }}>
              {t("settings.account.blocked_users.since", { date: formatDate(b.since) })}
            </span>
          </div>
          <button className="btn-small" onClick={() => onUnblock(b.pubkey)}>{t("settings.account.blocked_users.unblock_button")}</button>
        </div>
      ))}
    </SettingRow>
  );
}
