import { useEffect, useMemo, useState } from "react";
import { withSaved, withoutSaved, type StickerActions, type StickerCollectionState } from "@wavvon/ui";
import type { SavedSticker } from "@wavvon/core";
import type { Hub } from "@shared/types";
import { getStickerCollection, subscribeStickerCollection } from "../utils/prefsSync";
import {
  addCopyToStickerPack,
  ensureChannelSticker,
  listStickerPacks,
} from "../platform/commands/stickers";

function useStickerCollection(): StickerCollectionState {
  const [api, setApi] = useState(getStickerCollection);
  const [stickers, setStickers] = useState<SavedSticker[]>(() => getStickerCollection()?.get() ?? []);

  useEffect(() => {
    const sync = () => {
      const a = getStickerCollection();
      setApi(a);
      setStickers(a?.get() ?? []);
    };
    sync();
    return subscribeStickerCollection(sync);
  }, []);

  return useMemo(() => ({
    stickers,
    editable: api !== null,
    status: "ready" as const,
    save: async (entry) => { await api?.mutate((l) => withSaved(l, entry)); },
    remove: async (sha) => { await api?.mutate((l) => withoutSaved(l, sha)); },
  }), [api, stickers]);
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
  const collection = useStickerCollection();
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
