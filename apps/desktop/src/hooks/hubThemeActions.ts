import { invoke } from "@tauri-apps/api/core";
import { bytesToBase64, type HubThemeActions, type HubThemeRef } from "@wavvon/ui";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

export function makeHubThemeActions(hubUrl: string): HubThemeActions {
  const base = hubUrl.replace(/\/+$/, "");
  return {
    fetchCurrent: async () => {
      const info = (await (await fetchWithTimeout(`${base}/info`)).json()) as { theme?: HubThemeRef };
      if (!info.theme) return null;
      const res = await fetchWithTimeout(`${base}/hub/theme/${info.theme.sha256}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    upload: async (bytes) => {
      await invoke("hub_theme_upload", { fileB64: bytesToBase64(bytes) });
    },
    remove: async () => {
      await invoke("sticker_api", { method: "DELETE", path: "/hub/theme", body: null });
    },
  };
}
