import type { UnlistenFn } from "@tauri-apps/api/event";

/**
 * The Tauri `listen()` registrations of one effect run. `listen` resolves its
 * unlisten asynchronously, so a cleanup that runs first — every StrictMode
 * remount, any dependency change — used to miss it, and the handler kept
 * running on a stale closure. One that resolves after `close` is called at once.
 */
export function listenerScope() {
  let closed = false;
  const unlistens: UnlistenFn[] = [];
  return {
    add(registration: Promise<UnlistenFn>): void {
      void registration.then((unlisten) => {
        if (closed) unlisten();
        else unlistens.push(unlisten);
      });
    },
    close(): void {
      closed = true;
      unlistens.splice(0).forEach((unlisten) => unlisten());
    },
  };
}
