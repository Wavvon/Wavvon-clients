import { useTranslation } from "react-i18next";
import { formatPubkey } from "@wavvon/core";
import type { BlockEntry, IgnoreEntry } from "../types";
import { AccountLabelSuffix, PerAccountHint } from "./AccountScopeNote";

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
  return (
    <div>
      <div className="settings-section">
        <label className="settings-label">
          {t("settings.account.blocked_users.label", { count: blocks.length })}
          <AccountLabelSuffix label={accountLabel} />
        </label>
        <p className="muted">
          {t("settings.account.blocked_users.hint")}
        </p>
        <PerAccountHint label={accountLabel} />
        {blocks.length === 0 && <p className="muted">{t("settings.account.blocked_users.empty")}</p>}
        {blocks.map((b) => (
          <div key={b.pubkey} className="settings-row">
            <div>
              <span>{knownNames[b.pubkey] || formatPubkey(b.pubkey)}</span>
              <span className="muted" style={{ marginLeft: 8, fontSize: "var(--text-xs)" }}>
                {t("settings.account.blocked_users.since", { date: new Date(b.since * 1000).toLocaleDateString() })}
              </span>
            </div>
            <button className="btn-secondary" onClick={() => onUnblock(b.pubkey)}>{t("settings.account.blocked_users.unblock_button")}</button>
          </div>
        ))}
      </div>

      <div className="settings-section">
        <label className="settings-label">
          {t("settings.account.ignored_users.label", { count: ignores.length })}
          <AccountLabelSuffix label={accountLabel} />
        </label>
        <p className="muted">
          {t("settings.account.ignored_users.hint")}
        </p>
        <PerAccountHint label={accountLabel} />
        {ignores.length === 0 && <p className="muted">{t("settings.account.ignored_users.empty")}</p>}
        {ignores.map((ig) => (
          <div key={ig.pubkey} className="settings-row">
            <div>
              <span>{knownNames[ig.pubkey] || formatPubkey(ig.pubkey)}</span>
              <span className="muted" style={{ marginLeft: 8, fontSize: "var(--text-xs)" }}>
                {t("settings.account.ignored_users.since", { date: new Date(ig.since * 1000).toLocaleDateString() })}
              </span>
            </div>
            <button className="btn-secondary" onClick={() => onUnignore(ig.pubkey)}>{t("settings.account.ignored_users.unignore_button")}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
