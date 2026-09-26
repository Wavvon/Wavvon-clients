import { invoke } from "@tauri-apps/api/core";
import type { UnreadCountsDeps } from "@wavvon/ui";

// The platform half of the shared useUnreadCounts: desktop remembers unread
// state across restarts and paints a tray badge, and neither is something the
// hook can do for itself.
//
// A module-level constant rather than something built in App.tsx, because the
// hook takes these as effect dependencies — an object rebuilt each render
// would re-run the load on every one.
export const unreadPersistence: UnreadCountsDeps = {
  loadPersisted: () =>
    invoke<Record<string, Record<string, boolean>>>("load_unread_state").then((s) => s ?? null),
  persist: (state) => {
    invoke("save_unread_state", { state }).catch(() => {});
  },
  onTotalChange: (count) => {
    invoke("set_tray_unread", { count }).catch(() => {});
  },
};
