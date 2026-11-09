import { invoke } from "@tauri-apps/api/core";
import type { WidgetActions, WidgetSettings } from "@wavvon/ui";

// Through the shell's generic hub-settings pass-through, like attachments.
export const widgetActions: WidgetActions = {
  getWidget: () => invoke<WidgetSettings>("sticker_api", { method: "GET", path: "/admin/settings/widget", body: null }),
  putWidget: (settings) => invoke<WidgetSettings>("sticker_api", { method: "PUT", path: "/admin/settings/widget", body: settings }),
};
