import { useTranslation } from "react-i18next";
import type { Hub, BlockEntry, IgnoreEntry } from "@shared/types";
import { BlockIgnoreSection } from "@wavvon/ui";
import { IdentityBackupSection } from "../IdentityBackupSection";
import { FullArchiveSection } from "@components/admin/FullArchiveSection";
import { MyCertificationsSection } from "../MyCertificationsSection";
import { HomeHubsSection } from "../HomeHubsSection";
import { DevicesSection } from "../DevicesSection";
import { PasskeySection } from "../PasskeySection";
import { TrustedDevicesSection } from "../TrustedDevicesSection";
import { AccountsSwitcherSection } from "../AccountsSwitcherSection";
import { useActiveAccountLabel } from "@shared/hooks/useActiveAccountLabel";

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
}

export function AccountTab(props: Props) {
  const { t } = useTranslation();
  const activeHubUrl = props.hubs.find((h) => h.is_active)?.hub_url;
  const accountLabel = useActiveAccountLabel();
  return (
    <section>
      <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.account")}</h1>
      <AccountsSwitcherSection />
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
      <HomeHubsSection activeHubUrl={activeHubUrl} />
      <DevicesSection activeHubUrl={activeHubUrl} />
      <PasskeySection publicKey={props.publicKey} />
      <TrustedDevicesSection />
      <BlockIgnoreSection
        blocks={props.blocks}
        ignores={props.ignores}
        onUnblock={props.onUnblock}
        onUnignore={props.onUnignore}
        knownNames={props.knownNames}
        accountLabel={accountLabel}
      />
    </section>
  );
}
