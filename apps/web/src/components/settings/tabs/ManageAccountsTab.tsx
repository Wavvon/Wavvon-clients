import { listRecoveryPeople, listRecoveryRequestsToAttest } from "../../../platform/commands/recoveryPeople";
import { useTranslation } from "react-i18next";
import type { Hub } from "@shared/types";
import { ActiveAccountOnlyNotice, FullArchiveSection, IdentityBackupSection, RecoveryContactsSection, type RecoveryContactsSectionActions } from "@wavvon/ui";
import { formatPubkey } from "@wavvon/core";
import {
  getRecoveryContacts, setRecoveryContacts, removeRecoveryContact,
  openRotationRequest, getRotationRequestBundle, attestRotationRequest,
} from "@platform";
import { HomeHubsSection } from "../HomeHubsSection";
import { DISCOVERY_URL, MULTI_HUB } from "../../../constants";
import { FindableDirectorySection } from "../FindableDirectorySection";
import { MoveToUserClientSection } from "../MoveToUserClientSection";
import { AccountsSwitcherSection } from "../AccountsSwitcherSection";
import {
  switchAccount,
  SWITCH_BLOCKED_COOLDOWN,
  holdsMasterSeed,
  type IdentityRecord,
} from "@identity/index";
import type { PerAccountProps } from "@wavvon/ui";
import { identityNeedsBackup } from "../../../utils/identityBackup";
import { buildFullArchiveActions } from "../../../utils/fullArchiveActions";

interface Props extends PerAccountProps<IdentityRecord> {
  hubs: Hub[];
  publicKey: string | null;
  recoveryPhrase: string | null;
  onShowRecovery: () => void;
  inVoice: boolean;
  onBackedUp: () => void;
}

// Everything about getting accounts on/off this device: the switcher table
// (create/switch/remove/rename/reorder), recovery phrase + identity backup
// (unified shared component, settings-ia.md §4a), full archive — all
// active-account-scoped — plus the home-hub list, which follows the managing
// selector like the Devices/Privacy tabs.
export function ManageAccountsTab(props: Props) {
  const { t } = useTranslation();
  const activeHubUrl = props.hubs.find((h) => h.is_active)?.hub_url;
  const activeRecord = props.accounts?.find((a) => a.id === props.activeId);
  const activeIsPaired = activeRecord ? !holdsMasterSeed(activeRecord) : false;

  // switchAccount refuses (voice guard, switch cooldown) rather than always
  // succeeding — the import already went through by this point, so surface
  // the refusal via alert() rather than silently staying on the old account.
  function switchOrAlert(accountId: string) {
    const refused = switchAccount(accountId, "settings-account");
    if (refused) {
      alert(refused === SWITCH_BLOCKED_COOLDOWN ? t("settings.account.accounts.switch_cooldown") : refused);
    }
  }

  // Member-facing cards only (designate/request/vouch) — the admin queue
  // lives exclusively in HubAdminPage's Recovery requests tab, so no
  // listAdminRequests/approveRequest/denyRequest here.
  const recoveryActions: RecoveryContactsSectionActions = {
    getContacts: getRecoveryContacts,
    setContacts: setRecoveryContacts,
    removeContact: removeRecoveryContact,
    listPeople: listRecoveryPeople,
    listRequestsToAttest: listRecoveryRequestsToAttest,
    openRotationRequest: (oldPubkey, reason) => openRotationRequest(activeHubUrl ?? "", oldPubkey, reason),
    getRotationRequest: (id) => getRotationRequestBundle(activeHubUrl ?? "", id),
    attestRotationRequest: (bundle) => attestRotationRequest(activeHubUrl ?? "", bundle),
  };

  return (
    <section>
      <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.accounts")}</h1>
      <AccountsSwitcherSection inVoice={props.inVoice} onBackedUp={props.onBackedUp} />
      {props.managing && props.managing.id !== props.activeId && (
        <ActiveAccountOnlyNotice
          label={props.managing.account_label || formatPubkey(props.managing.id)}
          onSwitch={() => switchOrAlert(props.managing!.id)}
        />
      )}
      <IdentityBackupSection
        recoveryPhrase={props.recoveryPhrase}
        onRevealPhrase={props.onShowRecovery}
        needsBackup={identityNeedsBackup(activeRecord)}
        phraseHeldElsewhere={activeIsPaired}
      />
      <FullArchiveSection canExport={!!props.publicKey} actions={buildFullArchiveActions(t("settings.account.accounts.switch_cooldown"))} />
      {activeHubUrl && <RecoveryContactsSection isAdmin={false} actions={recoveryActions} />}
      {MULTI_HUB && props.managing && <HomeHubsSection activeHubUrl={activeHubUrl} account={props.managing} />}
      {DISCOVERY_URL && props.managing && <FindableDirectorySection account={props.managing} directoryUrl={DISCOVERY_URL} />}
      {!MULTI_HUB && props.managing && <MoveToUserClientSection account={props.managing} activeHubUrl={activeHubUrl} />}
    </section>
  );
}
