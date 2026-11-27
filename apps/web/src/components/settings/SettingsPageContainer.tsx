import type { Hub } from "@shared/types";
import { SettingsModal } from "@wavvon/ui";
import { SettingsPage } from "./SettingsPage";
import type { useSettingsProfile } from "../../hooks/useSettingsProfile";
import type { useNotificationPrefs } from "../../hooks/useNotificationPrefs";
import type { WebPush } from "../../hooks/useWebPush";
import { setScoped } from "../../utils/accountScope";

type SettingsProfileState = ReturnType<typeof useSettingsProfile>;
type NotifyPrefsState = ReturnType<typeof useNotificationPrefs>;

export interface SettingsPageContainerProps {
  settingsProfile: SettingsProfileState;
  notifyPrefs: NotifyPrefsState;
  hubs: Hub[];
  publicKey: string | null;
  blockedUsers: Set<string>;
  knownNames: Record<string, string | null>;
  inVoice: boolean;
  onHubProfileSaved: (hubId: string) => void;
  onUnblock: (pubkey: string) => void;
  webPush: WebPush;
}

// Wraps App's Settings overlay + the useSettingsProfile/useNotificationPrefs
// grouped state (state-access-design.md Phase 1), including the show/hide
// gate App used to own inline.
export function SettingsPageContainer({
  settingsProfile, notifyPrefs, hubs, publicKey, blockedUsers,
  knownNames, inVoice, onHubProfileSaved, onUnblock, webPush,
}: SettingsPageContainerProps) {
  if (!settingsProfile.showSettings) return null;
  const close = () => settingsProfile.setShowSettings(false);

  return (
    <SettingsModal onClose={close}>
      <SettingsPage
        tab={settingsProfile.settingsTab}
        onTab={settingsProfile.setSettingsTab}
        onClose={close}
        hubs={hubs}
        publicKey={publicKey}
        themes={settingsProfile.themes}
        onHubProfileSaved={onHubProfileSaved}
        webPush={webPush}
        mentionPingEnabled={settingsProfile.mentionPingEnabled}
        onMentionPingChange={(v) => {
          settingsProfile.setMentionPingEnabled(v);
          try { setScoped("wavvon.mentionPing", v ? "1" : "0"); } catch {}
        }}
        recoveryPhrase={settingsProfile.recoveryPhrase}
        onShowRecovery={settingsProfile.handleShowRecovery}
        blocks={Array.from(blockedUsers).map((p) => ({ pubkey: p, since: 0 }))}
        onUnblock={onUnblock}
        knownNames={knownNames}
        hideBirthdays={notifyPrefs.hideBirthdays}
        onToggleHideBirthdays={notifyPrefs.toggleHideBirthdays}
        inVoice={inVoice}
      />
    </SettingsModal>
  );
}
