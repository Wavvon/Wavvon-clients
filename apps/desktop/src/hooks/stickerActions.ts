import { invoke } from "@tauri-apps/api/core";
import type { SavedSticker } from "@wavvon/core";
import type {
  AdminSticker,
  Sticker,
  StickerBlockEntry,
  StickerPack,
  StickerPacksActions,
  StickerSettings,
  StickerSettingsActions,
  StickerStorageActions,
  StickerUsage,
} from "@wavvon/ui";

// The shell adds the session token and refuses anything that is not a sticker
// route; a failure rejects with "<status>:<body>", which the shared UI maps.
function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  return invoke<T>("sticker_api", { method, path, body: body ?? null });
}

export const listStickerPacks = () => api<StickerPack[]>("GET", "/stickers/packs");

export const ensureChannelSticker = (channelId: string, entry: SavedSticker) =>
  api<Sticker>("POST", `/channels/${channelId}/stickers`, {
    sha256: entry.sha256,
    origin_hub_url: entry.origin_hub_url,
    name: entry.name.slice(0, 32),
  });

export const addCopyToStickerPack = (packId: string, sha256: string) =>
  api<Sticker>("POST", `/stickers/packs/${packId}/stickers`, { sha256 });

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export const stickerPacksActions: StickerPacksActions = {
  listPacks: listStickerPacks,
  createPack: (name) => api<StickerPack>("POST", "/stickers/packs", { name }),
  renamePack: (packId, name) => api<void>("PATCH", `/stickers/packs/${packId}`, { name }),
  deletePack: (packId) => api<void>("DELETE", `/stickers/packs/${packId}`),
  uploadSticker: async (packId, name, file) =>
    invoke<Sticker>("sticker_upload", { packId, name, fileB64: await fileToBase64(file) }),
  removeSticker: (packId, stickerId) => api<void>("DELETE", `/stickers/packs/${packId}/stickers/${stickerId}`),
};

export const stickerStorageActions: StickerStorageActions = {
  listStored: ({ sort, limit, cursor }) => {
    const p = new URLSearchParams({ sort, limit: String(limit) });
    if (cursor) p.set("cursor", cursor);
    return api<AdminSticker[]>("GET", `/admin/stickers?${p}`);
  },
  getUsage: () => api<StickerUsage>("GET", "/admin/stickers/usage"),
  deleteSticker: (id, block) => api<void>("DELETE", `/admin/stickers/${id}${block ? "?block=true" : ""}`),
  listBlocklist: () => api<StickerBlockEntry[]>("GET", "/admin/stickers/blocklist"),
  unblock: (sha256) => api<void>("DELETE", `/admin/stickers/blocklist/${sha256}`),
};

export const stickerSettingsActions: StickerSettingsActions = {
  getSettings: () => api<StickerSettings>("GET", "/hub/settings"),
  saveSettings: (patch) => api<void>("PATCH", "/hub", patch),
};
