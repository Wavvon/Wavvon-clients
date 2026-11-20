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
      { id: "profile", label: t("settings.tabs.profile"), area: "profile" },
      { id: "trusted", label: t("settings.privacy.trusted_issuers.label"), area: "profile" },
      { id: "voice", label: t("settings.tabs.voice"), area: "av" },
      { id: "camera", label: t("settings.tabs.camera"), area: "av" },
      { id: "appearance", label: t("settings.tabs.appearance"), area: "app" },
      { id: "notifications", label: t("settings.tabs.notifications"), area: "app" },
      { id: "about", label: t("settings.tabs.about"), area: "app" },
      { id: "accounts", label: t("settings.tabs.accounts"), area: "account", attention: accountsAttention },
      { id: "devices", label: t("settings.tabs.devices"), area: "account" },
      { id: "privacy", label: t("settings.tabs.privacy"), area: "blocked" },
      { id: "help", label: t("settings.tabs.help"), area: "help" },
    ],
  };
}
