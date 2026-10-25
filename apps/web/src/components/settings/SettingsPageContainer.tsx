import type { Hub } from "@shared/types";
import { SettingsPage } from "./SettingsPage";
import type { useSettingsProfile } from "../../hooks/useSettingsProfile";
import type { useNotificationPrefs } from "../../hooks/useNotificationPrefs";
import { setScoped } from "../../utils/accountScope";

type SettingsProfileState = ReturnType<typeof useSettingsProfile>;
type NotifyPrefsState = ReturnType<typeof useNotificationPrefs>;

export interface SettingsPageContainerProps {
  settingsProfile: SettingsProfileState;
  notifyPrefs: NotifyPrefsState;
  hubs: Hub[];
  publicKey: string | null;
  blockedUsers: Set<string>;
  ignoredUsers: Set<string>;
  knownNames: Record<string, string | null>;
  inVoice: boolean;
  onHubProfileSaved: (hubId: string) => void;
  onUnblock: (pubkey: string) => void;
  onUnignore: (pubkey: string) => void;
}

// Wraps App's Settings overlay + the useSettingsProfile/useNotificationPrefs
// grouped state (state-access-design.md Phase 1), including the show/hide
// gate App used to own inline.
export function SettingsPageContainer({
  settingsProfile, notifyPrefs, hubs, publicKey, blockedUsers, ignoredUsers,
  knownNames, inVoice, onHubProfileSaved, onUnblock, onUnignore,
}: SettingsPageContainerProps) {
  if (!settingsProfile.showSettings) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "var(--bg)", overflow: "auto", display: "flex" }}>
      <SettingsPage
        tab={settingsProfile.settingsTab}
        onTab={settingsProfile.setSettingsTab}
        onClose={() => settingsProfile.setShowSettings(false)}
        hubs={hubs}
        publicKey={publicKey}
        theme={settingsProfile.theme}
        onThemeChange={settingsProfile.handleSetTheme}
        skin={settingsProfile.skin}
        onSkinChange={settingsProfile.handleSkinChange}
        customThemes={settingsProfile.customThemes}
        activeCustomThemeId={settingsProfile.activeCustomThemeId}
        onApplyCustomTheme={settingsProfile.handleApplyCustomTheme}
        onNewCustomTheme={settingsProfile.handleNewCustomTheme}
        onRenameCustomTheme={settingsProfile.handleRenameCustomTheme}
        onDuplicateCustomTheme={settingsProfile.handleDuplicateCustomTheme}
        onDeleteCustomTheme={settingsProfile.handleDeleteCustomTheme}
        onImportSkin={settingsProfile.handleImportCustomTheme}
        onHubProfileSaved={onHubProfileSaved}
        mentionPingEnabled={settingsProfile.mentionPingEnabled}
        onMentionPingChange={(v) => {
          settingsProfile.setMentionPingEnabled(v);
          try { setScoped("wavvon.mentionPing", v ? "1" : "0"); } catch {}
        }}
        recoveryPhrase={settingsProfile.recoveryPhrase}
        onShowRecovery={settingsProfile.handleShowRecovery}
        blocks={Array.from(blockedUsers).map((p) => ({ pubkey: p, since: 0 }))}
        ignores={Array.from(ignoredUsers).map((p) => ({ pubkey: p, since: 0 }))}
        onUnblock={onUnblock}
        onUnignore={onUnignore}
        knownNames={knownNames}
        hideBirthdays={notifyPrefs.hideBirthdays}
        onToggleHideBirthdays={notifyPrefs.toggleHideBirthdays}
        inVoice={inVoice}
      />
    </div>
  );
}
