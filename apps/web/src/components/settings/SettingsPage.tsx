import { useTranslation } from "react-i18next";
import type { Hub, NamedProfile, BlockEntry, IgnoreEntry } from "@shared/types";
import type { ThemeId, WavvonSkin } from "../../skinValidation";
import type { NamedCustomTheme } from "@shared/utils/customThemes";
import { ProfileTab } from "./tabs/ProfileTab";
import { NotificationsTab } from "./tabs/NotificationsTab";
import { AppearanceTab } from "./tabs/AppearanceTab";
import { VoiceTab } from "./tabs/VoiceTab";
import { CameraTab } from "./tabs/CameraTab";
import { AccountTab } from "./tabs/AccountTab";

export type SettingsTab = "profile" | "notifications" | "appearance" | "account" | "voice" | "camera";

interface SettingsPageProps {
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  onClose: () => void;
  hubs: Hub[];
  publicKey: string | null;
  theme: ThemeId;
  onThemeChange: (t: ThemeId) => void;
  skin: WavvonSkin | null;
  onSkinChange: (skin: WavvonSkin) => void;
  customThemes: NamedCustomTheme[];
  activeCustomThemeId: string | null;
  onApplyCustomTheme: (id: string) => void;
  onNewCustomTheme: () => void;
  onRenameCustomTheme: (id: string, name: string) => void;
  onDuplicateCustomTheme: (id: string) => void;
  onDeleteCustomTheme: (id: string) => void;
  profiles: NamedProfile[];
  defaultProfileId: string | null;
  activeDisplayName: string | null;
  onCreateProfile: (label: string, displayName: string, avatar: string | null) => void;
  onUpdateProfile: (id: string, patch: Partial<Omit<NamedProfile, "id">>) => void;
  onDeleteProfile: (id: string) => void;
  onSetDefaultProfile: (id: string) => void;
  onApplyProfileToHub: (id: string) => void;
  mentionPingEnabled?: boolean;
  onMentionPingChange?: (v: boolean) => void;
  recoveryPhrase: string | null;
  onShowRecovery: () => void;
  blocks: BlockEntry[];
  ignores: IgnoreEntry[];
  onUnblock: (pubkey: string) => void;
  onUnignore: (pubkey: string) => void;
  knownNames: Record<string, string | null>;
  onImportSkin: (skin: WavvonSkin) => void;
}

export function SettingsPage(props: SettingsPageProps) {
  const { t } = useTranslation();
  // Grouped into contiguous sections so the nav reads clearly, mirroring the
  // HubAdminPage nav pattern. Tab ids and labels are unchanged — only visual
  // grouping is added.
  const G_YOU = t("settings.nav_groups.you");
  const G_APP = t("settings.nav_groups.app");
  const G_AV = t("settings.nav_groups.audio_video");
  const G_SECURITY = t("settings.nav_groups.security");
  const TABS: { id: SettingsTab; label: string; group: string }[] = [
    { id: "profile", label: t("settings.tabs.profile"), group: G_YOU },
    { id: "notifications", label: t("settings.tabs.notifications"), group: G_APP },
    { id: "appearance", label: t("settings.tabs.appearance"), group: G_APP },
    { id: "voice", label: t("settings.tabs.voice"), group: G_AV },
    { id: "camera", label: t("settings.tabs.camera"), group: G_AV },
    { id: "account", label: t("settings.tabs.account"), group: G_SECURITY },
  ];

  return (
    <div className="settings-page" style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <aside className="settings-nav" style={{ width: 180, flexShrink: 0, borderRight: "1px solid var(--border)", padding: "16px 8px", display: "flex", flexDirection: "column" }}>
        <h2 style={{ padding: "0 8px", marginBottom: 12, fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>{t("settings.title")}</h2>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, flex: 1 }}>
          {TABS.map((tab, i) => (
            <li key={tab.id}>
              {(i === 0 || TABS[i - 1].group !== tab.group) && (
                <div className="settings-nav-group">{tab.group}</div>
              )}
              <button
                className={`settings-nav-item${props.tab === tab.id ? " active" : ""}`}
                onClick={() => props.onTab(tab.id)}
                style={{ width: "100%", textAlign: "left", padding: "6px 10px", borderRadius: "var(--r-sm)" }}
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
        <button className="settings-nav-close btn-ghost" onClick={props.onClose} style={{ marginTop: 8 }}>
          {t("modal.close")}
        </button>
      </aside>

      <main className="settings-content" style={{ flex: 1, overflow: "auto", padding: 24, position: "relative" }}>
        <button
          className="settings-close-x"
          onClick={props.onClose}
          title="Close"
          style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-muted)" }}
        >
          ×
        </button>

        {props.tab === "profile" && (
          <ProfileTab
            hubs={props.hubs}
            profiles={props.profiles}
            defaultProfileId={props.defaultProfileId}
            activeDisplayName={props.activeDisplayName}
            onCreateProfile={props.onCreateProfile}
            onUpdateProfile={props.onUpdateProfile}
            onDeleteProfile={props.onDeleteProfile}
            onSetDefaultProfile={props.onSetDefaultProfile}
            onApplyProfileToHub={props.onApplyProfileToHub}
          />
        )}

        {props.tab === "notifications" && (
          <NotificationsTab
            hubs={props.hubs}
            mentionPingEnabled={props.mentionPingEnabled}
            onMentionPingChange={props.onMentionPingChange}
          />
        )}

        {props.tab === "appearance" && (
          <AppearanceTab
            theme={props.theme}
            onThemeChange={props.onThemeChange}
            skin={props.skin}
            onSkinChange={props.onSkinChange}
            customThemes={props.customThemes}
            activeCustomThemeId={props.activeCustomThemeId}
            onApplyCustomTheme={props.onApplyCustomTheme}
            onNewCustomTheme={props.onNewCustomTheme}
            onRenameCustomTheme={props.onRenameCustomTheme}
            onDuplicateCustomTheme={props.onDuplicateCustomTheme}
            onDeleteCustomTheme={props.onDeleteCustomTheme}
            onImportSkin={props.onImportSkin}
          />
        )}

        {props.tab === "voice" && <VoiceTab />}

        {props.tab === "camera" && <CameraTab />}

        {props.tab === "account" && (
          <AccountTab
            hubs={props.hubs}
            publicKey={props.publicKey}
            recoveryPhrase={props.recoveryPhrase}
            onShowRecovery={props.onShowRecovery}
            blocks={props.blocks}
            ignores={props.ignores}
            onUnblock={props.onUnblock}
            onUnignore={props.onUnignore}
            knownNames={props.knownNames}
          />
        )}
      </main>
    </div>
  );
}
