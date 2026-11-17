import type { HubListing } from "../types";

/** What a newcomer told onboarding they are looking for. Kept on this device
 *  only: it is a search preference, not part of anyone's identity. */
export interface HubInterests {
  tags: string[];
  languages: string[];
  openOnly: boolean;
  nearestFirst: boolean;
}

export const POPULAR_TAGS = ["gaming", "music", "art", "tech", "anime", "sports", "community", "18+", "english", "social"];
export const HUB_LANGUAGES = ["en", "it", "es", "de", "fr", "pt", "nl", "pl", "ru", "ja", "ko", "zh"];

const KEY = "wavvon:hub-interests";

/** Saved interests, or a start from the UI language when there are none. */
export function hubInterestsOrDefault(uiLanguage: string): HubInterests {
  const base = uiLanguage.split("-")[0];
  return loadHubInterests() ?? {
    tags: [],
    languages: HUB_LANGUAGES.includes(base) ? [base] : [],
    openOnly: false,
    nearestFirst: false,
  };
}

export function loadHubInterests(): HubInterests | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<HubInterests>;
    return {
      tags: Array.isArray(v.tags) ? v.tags.filter((x) => typeof x === "string") : [],
      languages: Array.isArray(v.languages) ? v.languages.filter((x) => typeof x === "string") : [],
      openOnly: v.openOnly === true,
      nearestFirst: v.nearestFirst === true,
    };
  } catch {
    return null;
  }
}

export function saveHubInterests(v: HubInterests): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // Storage unavailable: the choices still apply for this session.
  }
}

/** A directory hub as the suggestions show it, with why it was picked. */
export interface HubSuggestion {
  hub: HubListing;
  matchedTags: string[];
  languageMatch: boolean;
  latencyMs: number | null;
}

/** Directory hubs that fit the interests: any chosen tag, any chosen
 *  language, open only if asked. No tags or no languages means no filter on
 *  that axis. Directory order is kept; `orderByLatency` reorders afterwards. */
export function matchHubs(hubs: HubListing[], interests: HubInterests): HubSuggestion[] {
  const wanted = new Set(interests.tags.map((t) => t.toLowerCase()));
  const langs = new Set(interests.languages.map((l) => l.toLowerCase()));
  const out: HubSuggestion[] = [];
  for (const hub of hubs) {
    if (interests.openOnly && hub.invite_only) continue;
    const matchedTags = hub.tags.filter((t) => wanted.has(t.toLowerCase()));
    if (wanted.size > 0 && matchedTags.length === 0) continue;
    const languageMatch = langs.has((hub.language ?? "").toLowerCase());
    if (langs.size > 0 && !languageMatch) continue;
    out.push({ hub, matchedTags, languageMatch, latencyMs: null });
  }
  return out;
}

/** Nearest first; hubs that did not answer go last, in their old order. */
export function orderByLatency(list: HubSuggestion[]): HubSuggestion[] {
  return list
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const la = a.s.latencyMs ?? Infinity;
      const lb = b.s.latencyMs ?? Infinity;
      return la === lb ? a.i - b.i : la - lb;
    })
    .map(({ s }) => s);
}
