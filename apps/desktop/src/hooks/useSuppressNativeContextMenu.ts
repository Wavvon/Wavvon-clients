import { useEffect } from "react";

// Suppress the webview's default right-click menu (Reload / Inspect /
// Back). Tauri 2 still enables it by default and a stray right-click
// anywhere on the chrome would let the user accidentally reload the app.
// Components that want their own context menu (channel rows, messages,
// user list items) call e.preventDefault() in their onContextMenu, which
// also stops the browser default — so they keep working unchanged.
// Native menus stay available inside text inputs so copy/paste isn't
// broken.
export function useSuppressNativeContextMenu() {
  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        target.closest("[data-allow-context-menu]")
      ) {
        return;
      }
      e.preventDefault();
    };
    document.addEventListener("contextmenu", onContext);
    return () => document.removeEventListener("contextmenu", onContext);
  }, []);
}
