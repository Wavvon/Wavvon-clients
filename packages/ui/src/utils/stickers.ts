import type { SavedSticker } from "@wavvon/core";
import type { Sticker } from "../types";

export function stickerSrc(hubUrl: string, sha256: string): string {
  return `${hubUrl.replace(/\/+$/, "")}/stickers/${sha256}`;
}

/** Only http(s) origins become links: the URL is the hub's own record of where
 *  it fetched the sticker, but an `<a href>` is the wrong place to trust that. */
export function safeOriginHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

function sameHub(a: string, b: string): boolean {
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
}

/** Where the picker loads a saved sticker from. Its origin was named by the hub
 *  it was saved on, and the entry syncs to every device, so an origin the user
 *  has not joined could be any host at all: ask the current hub instead, which
 *  serves stickers by hash. */
export function savedStickerSrc(entry: SavedSticker, currentHubUrl: string, joinedHubUrls: string[]): string {
  const trusted = joinedHubUrls.some((u) => sameHub(u, entry.origin_hub_url));
  return stickerSrc(trusted ? entry.origin_hub_url : currentHubUrl, entry.sha256);
}

/** The entry "Save to my collection" records. A sticker with no origin is one
 *  of the reading hub's own pack stickers, so that hub is the origin. */
export function savedEntryFor(
  sticker: Sticker,
  hub: { url: string; name: string },
  now: number = Math.floor(Date.now() / 1000),
): SavedSticker {
  return {
    sha256: sticker.sha256,
    name: sticker.name,
    origin_hub_url: sticker.origin_hub_url ?? hub.url,
    origin_hub_name: sticker.origin_hub_name ?? hub.name,
    saved_at: now,
  };
}

export function isSaved(collection: SavedSticker[], sha256: string): boolean {
  return collection.some((s) => s.sha256 === sha256);
}

/** A saved sticker that belongs to the hub being sent to needs no
 *  `stickers.external`; any other has to be fetched from its origin. */
export function needsExternal(entry: SavedSticker, currentHubUrl: string): boolean {
  return !sameHub(entry.origin_hub_url, currentHubUrl);
}

export function withSaved(collection: SavedSticker[], entry: SavedSticker): SavedSticker[] {
  return isSaved(collection, entry.sha256) ? collection : [...collection, entry];
}

export function withoutSaved(collection: SavedSticker[], sha256: string): SavedSticker[] {
  return collection.filter((s) => s.sha256 !== sha256);
}

export type StickerErrorContext = "send" | "manage";

/** Web's HubApiError carries `status`; desktop's shell rejects with
 *  `<status>:<body>`. No status at all means the request never got an answer,
 *  which must not be read as any particular answer. */
export function parseHubError(e: unknown): { status: number | null; body: string } {
  if (e && typeof e === "object" && typeof (e as { status?: unknown }).status === "number") {
    return { status: (e as { status: number }).status, body: String((e as { message?: unknown }).message ?? "") };
  }
  const text = e instanceof Error ? e.message : String(e);
  const m = /^(\d{3}):([\s\S]*)$/.exec(text);
  return m ? { status: Number(m[1]), body: m[2] } : { status: null, body: text };
}

/** Maps a hub's answer to an i18n key. A 502 is "not available right now",
 *  never "does not exist": the origin may only be offline. */
export function stickerErrorKey(e: unknown, ctx: StickerErrorContext = "send"): string {
  const { status, body } = parseHubError(e);
  switch (status) {
    case 400:
      return "stickers.error.bad_image";
    case 403:
      if (body.includes("sticker_blocked")) return "stickers.error.blocked";
      if (body.includes("sticker_removed")) return "stickers.error.removed";
      return ctx === "send" ? "stickers.error.external_only" : "stickers.error.forbidden";
    case 404:
      return "stickers.error.not_found";
    case 409:
      if (body.includes("packs_full")) return "stickers.error.packs_full";
      if (body.includes("pack_full")) return "stickers.error.pack_full";
      if (body.includes("too_many_packs")) return "stickers.error.too_many_packs";
      if (body.includes("already_in_a_pack")) return "stickers.error.already_in_a_pack";
      return "stickers.error.generic";
    case 410:
      return body.includes("evicted") ? "stickers.error.evicted" : "stickers.error.removed";
    case 413:
      return "stickers.error.too_large";
    case 429:
      return "stickers.error.rate_limited";
    case 502:
      return "stickers.error.unavailable";
    case null:
      return "stickers.error.network";
    default:
      return "stickers.error.generic";
  }
}
