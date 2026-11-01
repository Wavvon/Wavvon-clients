import { invoke } from "@tauri-apps/api/core";
import type { AttachmentSettings, AttachmentSettingsActions } from "@wavvon/ui";

// The sticker pass-through is the shell's one generic hub-settings route.
export const attachmentSettingsActions: AttachmentSettingsActions = {
  getSettings: () => invoke<AttachmentSettings>("sticker_api", { method: "GET", path: "/hub/settings", body: null }),
  saveSettings: (patch) => invoke<void>("sticker_api", { method: "PATCH", path: "/hub", body: patch }),
};
