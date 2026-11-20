import { invoke } from "@tauri-apps/api/core";
import type { HubLanding } from "@wavvon/core";
import type { InviteLandingActions } from "@wavvon/ui";

export function makeInviteLandingActions(hubUrl: string): InviteLandingActions {
  const base = hubUrl.replace(/\/+$/, "");
  const patch = (body: object) => invoke("sticker_api", { method: "PATCH", path: "/hub", body }).then(() => {});
  return {
    load: async () => {
      const s = (await invoke("sticker_api", { method: "GET", path: "/hub/settings", body: null })) as { landing?: HubLanding };
      return {
        // The path never changes, so a fresh query keeps a replaced image out of the cache.
        imageUrl: s.landing?.image ? `${base}${s.landing.image}?v=${Date.now()}` : null,
        colors: s.landing?.colors ?? null,
      };
    },
    saveImage: (dataUrl) => patch({ landing_image: dataUrl }),
    saveColors: (colors) => patch({ landing_colors: colors ?? [] }),
  };
}
