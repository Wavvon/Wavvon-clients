import { useSyncExternalStore } from "react";

// The voice view's bar is drawn by the stage, but its controls (share, camera,
// whisper, soundboard) are wired where the rest of the voice controls are, in
// the channel sidebar. The stage publishes its bar element here; the sidebar
// portals the controls into it. No stage on screen, no bar.
let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();

export function setVoiceBarSlot(el: HTMLElement | null): void {
  if (slot === el) return;
  slot = el;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useVoiceBarSlot(): HTMLElement | null {
  return useSyncExternalStore(subscribe, () => slot, () => null);
}
