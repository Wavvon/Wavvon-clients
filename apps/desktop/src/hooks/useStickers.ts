import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SavedSticker } from "@wavvon/core";
import type { StickerActions, StickerCollectionState } from "@wavvon/ui";
import type { Hub } from "../types";
import { addCopyToStickerPack, ensureChannelSticker, listStickerPacks } from "./stickerActions";

interface Collection {
  editable: boolean;
  stickers: SavedSticker[];
}

function useStickerCollection(hubUrl: string | null, enabled: boolean): StickerCollectionState {
  const [state, setState] = useState<{ status: StickerCollectionState["status"]; value: Collection }>({
    status: "loading",
    value: { editable: false, stickers: [] },
  });

  const load = useCallback(async () => {
    try {
      setState({ status: "ready", value: await invoke<Collection>("sticker_collection_get") });
    } catch {
      setState((s) => ({ ...s, status: "error" }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    setState({ status: "loading", value: { editable: false, stickers: [] } });
    void load();
  }, [enabled, hubUrl, load]);

  return useMemo(() => {
    async function update(edit: { add?: SavedSticker; remove?: string }) {
      const stickers = await invoke<SavedSticker[]>("sticker_collection_update", {
        add: edit.add ?? null,
        remove: edit.remove ?? null,
      });
      setState({ status: "ready", value: { editable: true, stickers } });
    }
    return {
      stickers: state.value.stickers,
      editable: state.value.editable && state.status === "ready",
      status: state.status,
      save: (add) => update({ add }),
      remove: (remove) => update({ remove }),
    };
  }, [state]);
}

interface Args {
  hub: Hub | undefined;
  supported: boolean;
  canManagePacks: boolean;
  canUseExternal: boolean;
  sendSticker: (channelId: string, stickerId: string) => Promise<void>;
}

/** Undefined where the hub does not advertise `stickers`, which hides every
 *  sticker control in the shared UI. */
export function useStickers({ hub, supported, canManagePacks, canUseExternal, sendSticker }: Args): StickerActions | undefined {
  const collection = useStickerCollection(hub?.hub_url ?? null, supported);
  return useMemo(() => {
    if (!supported || !hub) return undefined;
    return {
      hubUrl: hub.hub_url,
      hubName: hub.hub_name,
      listPacks: listStickerPacks,
      sendPackSticker: sendSticker,
      sendSavedSticker: async (channelId, entry) => {
        const s = await ensureChannelSticker(channelId, entry);
        await sendSticker(channelId, s.id);
      },
      addToPack: async (packId, sha256) => { await addCopyToStickerPack(packId, sha256); },
      collection,
      canManagePacks,
      canUseExternal,
    };
  }, [supported, hub, collection, canManagePacks, canUseExternal, sendSticker]);
}
