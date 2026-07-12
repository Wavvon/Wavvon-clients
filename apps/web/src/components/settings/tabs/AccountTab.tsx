import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Hub, BlockEntry, IgnoreEntry } from "@shared/types";
import { IdentityBackupSection } from "../IdentityBackupSection";
import { FullArchiveSection } from "@components/admin/FullArchiveSection";
import { MyCertificationsSection } from "../MyCertificationsSection";
import { HomeHubsSection } from "../HomeHubsSection";
import { DevicesSection } from "../DevicesSection";
import { PasskeySection } from "../PasskeySection";
import { TrustedDevicesSection } from "../TrustedDevicesSection";
import { AccountsSwitcherSection } from "../AccountsSwitcherSection";
import { ManagingAccountSelector } from "../ManagingAccountSelector";
import { AccountBlockIgnoreSection } from "../AccountBlockIgnoreSection";
import { listAccountsOrdered, getActiveAccountId, type IdentityRecord } from "@identity/index";
import { resolveManagingAccount } from "./resolveManagingAccount";

interface Props {
  hubs: Hub[];
  publicKey: string | null;
  recoveryPhrase: string | null;
  onShowRecovery: () => void;
  blocks: BlockEntry[];
  ignores: IgnoreEntry[];
  onUnblock: (pubkey: string) => void;
  onUnignore: (pubkey: string) => void;
  knownNames: Record<string, string | null>;
  inVoice: boolean;
}

export function AccountTab(props: Props) {
  const { t } = useTranslation();
  const activeHubUrl = props.hubs.find((h) => h.is_active)?.hub_url;
  const activeId = getActiveAccountId();
  const [accounts, setAccounts] = useState<IdentityRecord[] | null>(null);
  // Ephemeral: which account the sections below act on. Resets to the
  // active account on every mount — AccountTab (and this state with it)
  // remounts whenever the account actually switches, since App keys off the
  // account id (AccountRoot.tsx) — so there's never a stale "managing"
  // pointer left over from a previous account.
  const [managingId, setManagingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAccountsOrdered().then((list) => {
      if (cancelled) return;
      setAccounts(list);
      setManagingId((prev) => prev ?? activeId ?? list[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const managing = resolveManagingAccount(accounts, managingId, activeId);

  return (
    <section>
      <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.account")}</h1>
      <AccountsSwitcherSection inVoice={props.inVoice} />
      {accounts && managing && (
        <ManagingAccountSelector
          accounts={accounts}
          activeId={activeId}
          selectedId={managing.id}
          onChange={setManagingId}
        />
      )}
      <div className="settings-section">
        <label className="settings-label">{t("settings.security.recovery.label")}</label>
        <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
          {t("settings.security.recovery.hint")}
        </p>
        {props.recoveryPhrase ? (
          <div
            className="recovery-phrase"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "10px 14px", fontFamily: "monospace", lineHeight: 1.8, fontSize: "var(--text-sm)" }}
          >
            {props.recoveryPhrase}
          </div>
        ) : (
          <button className="btn-secondary" onClick={props.onShowRecovery}>
            {t("settings.security.recovery.reveal")}
          </button>
        )}
      </div>
      <div className="settings-section" style={{ marginTop: 20 }}>
        {/* IdentityBackupSection renders its own "Identity backup" heading. */}
        <IdentityBackupSection publicKey={props.publicKey} />
      </div>
      <FullArchiveSection publicKey={props.publicKey} />
      <MyCertificationsSection publicKey={props.publicKey} />
      {managing && <HomeHubsSection activeHubUrl={activeHubUrl} account={managing} />}
      {managing && <DevicesSection activeHubUrl={activeHubUrl} account={managing} />}
      {managing && <PasskeySection publicKey={props.publicKey} account={managing} />}
      {managing && <TrustedDevicesSection account={managing} />}
      {managing && (
        <AccountBlockIgnoreSection
          account={managing}
          activeBlocks={props.blocks}
          activeIgnores={props.ignores}
          onUnblockActive={props.onUnblock}
          onUnignoreActive={props.onUnignore}
          knownNames={props.knownNames}
        />
      )}
    </section>
  );
}
