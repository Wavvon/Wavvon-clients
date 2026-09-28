import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey } from "@wavvon/core";
import type { BlockEntry, IgnoreEntry } from "../types";
import { SettingRow } from "./SettingRow";

interface Props {
  blocks: BlockEntry[];
  ignores: IgnoreEntry[];
  onUnblock: (pubkey: string) => void;
  onUnignore: (pubkey: string) => void;
  knownNames: Record<string, string | null>;
  // Active account's label (desktop leaves this unset — single-account today).
  accountLabel?: string | null;
}

export function BlockIgnoreSection({ blocks, ignores, onUnblock, onUnignore, knownNames, accountLabel }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  const row = (id: string) => ({
    open: open === id,
    onToggle: () => setOpen((cur) => (cur === id ? null : id)),
  });

  return (
    <>
      <SettingRow
        title={t("settings.account.blocked_users.title")}
        state={blocks.length === 0
          ? t("settings.account.blocked_users.empty")
          : t("settings.account.blocked_users.state", { count: blocks.length })}
        meta={blocks.length > 0 ? String(blocks.length) : undefined}
        {...row("blocked")}
      >
        <p className="muted">{t("settings.account.blocked_users.hint")}</p>
        {blocks.map((b) => (
          <div key={b.pubkey} className="settings-row">
            <div>
              <span>{knownNames[b.pubkey] || formatPubkey(b.pubkey)}</span>
              <span className="muted" style={{ marginLeft: 8, fontSize: "var(--text-xs)" }}>
                {t("settings.account.blocked_users.since", { date: new Date(b.since * 1000).toLocaleDateString() })}
              </span>
            </div>
            <button className="btn-small" onClick={() => onUnblock(b.pubkey)}>{t("settings.account.blocked_users.unblock_button")}</button>
          </div>
        ))}
      </SettingRow>

      <SettingRow
        title={t("settings.account.ignored_users.title")}
        state={ignores.length === 0
          ? t("settings.account.ignored_users.empty")
          : t("settings.account.ignored_users.state", { count: ignores.length })}
        meta={ignores.length > 0 ? String(ignores.length) : undefined}
        {...row("ignored")}
      >
        <p className="muted">{t("settings.account.ignored_users.hint")}</p>
        {ignores.map((ig) => (
          <div key={ig.pubkey} className="settings-row">
            <div>
              <span>{knownNames[ig.pubkey] || formatPubkey(ig.pubkey)}</span>
              <span className="muted" style={{ marginLeft: 8, fontSize: "var(--text-xs)" }}>
                {t("settings.account.ignored_users.since", { date: new Date(ig.since * 1000).toLocaleDateString() })}
              </span>
            </div>
            <button className="btn-small" onClick={() => onUnignore(ig.pubkey)}>{t("settings.account.ignored_users.unignore_button")}</button>
          </div>
        ))}
      </SettingRow>
    </>
  );
}
