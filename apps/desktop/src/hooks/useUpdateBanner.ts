import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type UpdatePhase = "downloading" | "ready" | "failed" | "installing";

export interface UpdateStatus {
  version: string;
  notes: string | null;
  phase: UpdatePhase;
  downloaded: number;
  total: number | null;
  error: string | null;
}

// Module-level so a dismissal outlives the App remount on account switch but
// not the session: the next launch shows the banner again.
let dismissedVersion: string | null = null;

export function useUpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState(dismissedVersion);

  useEffect(() => {
    let cancelled = false;
    let heardEvent = false;
    let unlistenFn: (() => void) | null = null;
    listen<UpdateStatus>("update-status", (ev) => {
      heardEvent = true;
      setStatus(ev.payload);
    }).then((fn) => {
      if (cancelled) { fn(); return; }
      unlistenFn = fn;
      // The check may have run before this listener existed (startup, or an
      // App remount), so ask for the current state once.
      invoke<UpdateStatus | null>("get_update_status")
        .then((s) => { if (!cancelled && !heardEvent) setStatus(s); })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, []);

  const visible = status && status.version !== dismissed ? status : null;
  return {
    updateStatus: visible,
    dismissUpdate: () => {
      if (!status) return;
      dismissedVersion = status.version;
      setDismissed(status.version);
    },
  };
}
