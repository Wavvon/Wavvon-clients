import i18n, {
  currentLanguageId,
  languageOptions,
  LANGUAGES,
  resolveLanguage,
  setLanguage,
  unregisterLanguagePack,
} from "@wavvon/i18n";
import { sha256Hex } from "../themes/gallery";
import { loadLangPack, registerLangPack, type StoredLangPack } from "./langPack";

/** `languages` on a hub's `/info` and `GET /hub/languages` (`hub.languages`). */
export interface HubLanguagesInfo {
  default?: string | null;
  packs: { code: string; name: string; sha256: string }[];
}

export const LANGUAGE_CHOICE_KEY = "wavvon_language";

export function hubLanguageUrl(hubUrl: string, sha256: string): string {
  return `${hubUrl.replace(/\/+$/, "")}/hub/languages/${sha256}`;
}

// One download per hash for the life of the page, as for hub themes.
const loaded = new Map<string, Promise<StoredLangPack>>();

/** Fetch a hub pack by its hash URL, check the hash and validate it like any
 *  other pack. Rejects on any failure. */
export function loadHubLangPack(
  hubUrl: string,
  sha256: string,
  fetchFn: (url: string) => Promise<Response>,
): Promise<StoredLangPack> {
  const url = hubLanguageUrl(hubUrl, sha256);
  let p = loaded.get(url);
  if (!p) {
    p = (async () => {
      const res = await fetchFn(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if ((await sha256Hex(bytes)).toLowerCase() !== sha256.toLowerCase()) {
        throw new Error("The hub language pack does not match its hash");
      }
      return { id: `hub:${sha256}`, sha256, ...loadLangPack(bytes) };
    })();
    p.catch(() => loaded.delete(url));
    loaded.set(url, p);
  }
  return p;
}

function storedChoice(): string | null {
  try {
    return localStorage.getItem(LANGUAGE_CHOICE_KEY);
  } catch {
    return null;
  }
}

/** The language id a hub default names: its own pack for that code, else a
 *  shipped language with that code. */
function defaultId(info: HubLanguagesInfo | null, packIds: Map<string, string>): string | null {
  const code = info?.default;
  if (!code) return null;
  return packIds.get(code) ?? LANGUAGES.find((l) => l.id === code)?.id ?? null;
}

/** Offer the open hub's packs in the language list, replacing the previous
 *  hub's. Packs that fail to load are left out. Returns the id of the hub's
 *  default language, if it names one this client has. Safe before initI18n. */
export async function registerHubLanguages(
  hubUrl: string | null,
  info: HubLanguagesInfo | null,
  fetchFn: (url: string) => Promise<Response>,
): Promise<string | null> {
  const packs = hubUrl && info ? info.packs : [];
  const results = await Promise.allSettled(packs.map((p) => loadHubLangPack(hubUrl!, p.sha256, fetchFn)));
  const keep = new Set<string>();
  const packIds = new Map<string, string>();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    registerLangPack(r.value, "hub");
    keep.add(r.value.id);
    packIds.set(r.value.manifest.code, r.value.id);
  }
  for (const o of languageOptions()) {
    if (o.source === "hub" && !keep.has(o.id)) unregisterLanguagePack(o.id);
  }
  i18n.emit("wavvonLanguagesChanged");
  return defaultId(info, packIds);
}

/** registerHubLanguages, then switch: the user's own language always wins;
 *  otherwise the hub's default when `useDefault` (the hub build), and a
 *  language the previous hub chose is left once it is no longer offered. */
export async function applyHubLanguages(
  hubUrl: string | null,
  info: HubLanguagesInfo | null,
  fetchFn: (url: string) => Promise<Response>,
  useDefault: boolean,
): Promise<void> {
  const hubDefault = await registerHubLanguages(hubUrl, info, fetchFn);
  const def = useDefault ? hubDefault : null;
  const choice = storedChoice();
  const want =
    choice && languageOptions().some((o) => o.id === choice)
      ? choice
      : def ?? resolveLanguage(null, typeof navigator === "undefined" ? "en" : navigator.language);
  if (want !== currentLanguageId()) await setLanguage(want);
}
