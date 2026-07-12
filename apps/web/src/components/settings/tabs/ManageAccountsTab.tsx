import { useTranslation } from "react-i18next";
import type { Hub } from "@shared/types";
import { IdentityBackupSection } from "../IdentityBackupSection";
import { FullArchiveSection } from "@components/admin/FullArchiveSection";
import { HomeHubsSection } from "../HomeHubsSection";
import { AccountsSwitcherSection } from "../AccountsSwitcherSection";
import { ManagingAccountSelector } from "../ManagingAccountSelector";
import type { PerAccountProps } from "./perAccount";

interface Props extends PerAccountProps {
  hubs: Hub[];
  publicKey: string | null;
  recoveryPhrase: string | null;
  onShowRecovery: () => void;
  inVoice: boolean;
}

// Everything about getting accounts on/off this device: the switcher table
// (create/switch/remove/rename/reorder), recovery phrase, identity backup,
// full archive — all active-account-scoped — plus the home-hub list, which
// follows the managing selector like the Devices/Privacy tabs.
export function ManageAccountsTab(props: Props) {
  const { t } = useTranslation();
  const activeHubUrl = props.hubs.find((h) => h.is_active)?.hub_url;

  return (
    <section>
      <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.accounts")}</h1>
      <AccountsSwitcherSection inVoice={props.inVoice} />
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
      {props.accounts && props.managing && (
        <ManagingAccountSelector
          accounts={props.accounts}
          activeId={props.activeId}
          selectedId={props.managing.id}
          onChange={props.onManagingChange}
        />
      )}
      {props.managing && <HomeHubsSection activeHubUrl={activeHubUrl} account={props.managing} />}
    </section>
  );
}
