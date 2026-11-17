import { invoke } from "@tauri-apps/api/core";
import { bytesToBase64, type HubLanguagesActions, type HubLanguagesInfo } from "@wavvon/ui";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

export function makeHubLanguagesActions(hubUrl: string): HubLanguagesActions {
  const base = hubUrl.replace(/\/+$/, "");
  return {
    list: async () => {
      const res = await fetchWithTimeout(`${base}/hub/languages`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as HubLanguagesInfo;
    },
    upload: async (bytes) => {
      await invoke("hub_language_upload", { fileB64: bytesToBase64(bytes) });
    },
    remove: async (sha256) => {
      await invoke("sticker_api", { method: "DELETE", path: `/hub/languages/${encodeURIComponent(sha256)}`, body: null });
    },
    setDefault: async (code) => {
      await invoke("sticker_api", { method: "PUT", path: "/hub/languages/default", body: { code } });
    },
  };
}
