import type { SavedSticker } from "@wavvon/core";
import type { StickerPack } from "../../types";

export interface StickerCollectionState {
  stickers: SavedSticker[];
  /** False on a device that does not hold the master seed (v1): the list is
   *  read-only there, and Save/Remove are not offered. */
  editable: boolean;
  /** "error" means the home hub could not be asked, which is not the same as
   *  an empty collection. */
  status: "loading" | "ready" | "error";
  save: (entry: SavedSticker) => Promise<void>;
  remove: (sha256: string) => Promise<void>;
}

/** Everything the picker and a sticker in chat need from the app. The client
 *  never uploads or caches sticker bytes: sending a saved one is an
 *  ensure-then-send on the hub being written to. */
export interface StickerActions {
  hubUrl: string;
  hubName: string;
  /** Every hub the user has joined; a saved sticker loads from its origin only if listed. */
  joinedHubUrls: string[];
  listPacks: () => Promise<StickerPack[]>;
  sendPackSticker: (channelId: string, stickerId: string) => Promise<void>;
  sendSavedSticker: (channelId: string, entry: SavedSticker) => Promise<void>;
  addToPack: (packId: string, sha256: string) => Promise<void>;
  collection: StickerCollectionState;
  canManagePacks: boolean;
  canUseExternal: boolean;
}
