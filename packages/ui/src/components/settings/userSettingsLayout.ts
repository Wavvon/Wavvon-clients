import type { SettingsAreaDef, SettingsSectionDef } from "./SettingsShell";

export type UserSettingsSection =
  | "profile"
  | "trusted"
  | "voice"
  | "camera"
  | "appearance"
  | "notifications"
  | "about"
  | "accounts"
  | "devices"
  | "privacy"
  | "help";

export type UserSettingsArea = "profile" | "av" | "app" | "account" | "blocked" | "help";

// The user settings map (Wavvon-clients#464), one list for both apps so they
// cannot drift: which area each section lives in, and in what order it stacks.
export function userSettingsLayout(t: (key: string) => string, accountsAttention?: string): {
  areas: SettingsAreaDef<UserSettingsArea>[];
  sections: SettingsSectionDef<UserSettingsSection, UserSettingsArea>[];
} {
  return {
    areas: [
      { id: "profile", label: t("settings.areas.profile") },
      { id: "av", label: t("settings.areas.audio_video"), deviceWide: true },
      { id: "app", label: t("settings.areas.app"), deviceWide: true },
      { id: "account", label: t("settings.areas.account") },
      { id: "blocked", label: t("settings.tabs.privacy") },
      { id: "help", label: t("settings.tabs.help"), hidden: true, deviceWide: true },
    ],
    sections: [
      { id: "profile", label: t("settings.tabs.profile"), area: "profile", keywords: [t("settings.profile.fields.bio_label"), t("settings.profile.fields.status_label"), t("settings.profile.fields.pronouns_label"), t("settings.account.certifications.label")] },
      { id: "trusted", label: t("settings.privacy.trusted_issuers.label"), area: "profile" },
      { id: "voice", label: t("settings.tabs.voice"), area: "av", keywords: [t("settings.voice.devices.label"), t("settings.ptt.label"), t("settings.voice.noise.label"), t("settings.voice.mic_test.label"), t("settings.voice.quality.label")] },
      { id: "camera", label: t("settings.tabs.camera"), area: "av", keywords: [t("settings.camera.background_label")] },
      { id: "appearance", label: t("settings.tabs.appearance"), area: "app", keywords: [t("settings.theme.label"), t("settings.language.label")] },
      { id: "notifications", label: t("settings.tabs.notifications"), area: "app", keywords: [t("settings.notifications.desktop.label"), t("settings.notifications.push.label"), t("settings.notifications.mention.label"), t("settings.notifications.voice_sounds.label"), t("settings.notifications.per_hub.label")] },
      { id: "about", label: t("settings.tabs.about"), area: "app" },
      { id: "accounts", label: t("settings.tabs.accounts"), area: "account", keywords: [t("settings.account.identity_backup.label"), t("settings.security.recovery.label"), t("settings.account.passkeys.label"), t("settings.account.home_hubs.label"), t("settings.account.full_archive.label"), t("settings.account.local_data.label")], attention: accountsAttention },
      { id: "devices", label: t("settings.tabs.devices"), area: "account", keywords: [t("settings.account.devices.pair_label")] },
      { id: "privacy", label: t("settings.tabs.privacy"), area: "blocked", keywords: [t("settings.account.blocked_users.title"), t("settings.account.ignored_users.title")] },
      { id: "help", label: t("settings.tabs.help"), area: "help" },
    ],
  };
}
