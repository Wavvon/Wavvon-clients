import type { SavedHub } from "@platform";
import {
  deviceLanguageStore,
  deviceThemeStore,
  restoreLanguages,
  restoreThemes,
  type ExistingAccountSnapshot,
  type LanguageStore,
  type RestorePlan,
  type ThemeStore,
} from "@wavvon/ui";
import { getScoped, setScoped } from "./accountScope";

// Web's storage half of a full-archive restore (docs/docs/data-export.md §5);
// the merge rule itself is the shared planRestore. Both functions take an
// explicit accountId so a restore never touches the active account's data
// unless that is the one being restored into.

const SAVED_HUBS_KEY = "wavvon:saved_hubs";
const DRAFTS_KEY = "wavvon.drafts";
const VOICE_GAINS_KEY = "wavvon.voice_gains";
const MENTION_PING_KEY = "wavvon.mentionPing";

// The archive's `identity` section is whatever fields happened to be on the
// exporting device's IdentityRecord — read leniently, the same fields
// resolveOrCreateAccount accepts for the plain identity-backup import.
export interface ArchiveIdentityInput {
  seed_hex: string;
  master_pubkey?: string;
  device_label?: string;
  subkey_cert?: unknown;
  account_label?: string;
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function readExistingAccountSnapshot(
  accountId: string,
  themeStore: ThemeStore = deviceThemeStore,
  languageStore: LanguageStore = deviceLanguageStore,
): Promise<ExistingAccountSnapshot> {
  return {
    hubList: safeJsonParse<SavedHub[]>(getScoped(SAVED_HUBS_KEY, accountId), []),
    drafts: safeJsonParse<Record<string, string>>(getScoped(DRAFTS_KEY, accountId), {}),
    themeNames: (await themeStore.list()).map((t) => t.manifest.name),
    languageNames: (await languageStore.list()).map((l) => l.manifest.name),
    voiceGains: safeJsonParse<Record<string, number>>(getScoped(VOICE_GAINS_KEY, accountId), {}),
    hasMentionPingSetting: getScoped(MENTION_PING_KEY, accountId) !== null,
  };
}

export async function applyRestorePlan(
  accountId: string,
  plan: RestorePlan,
  themeStore: ThemeStore = deviceThemeStore,
  languageStore: LanguageStore = deviceLanguageStore,
): Promise<void> {
  setScoped(SAVED_HUBS_KEY, JSON.stringify(plan.hubList), accountId);
  setScoped(DRAFTS_KEY, JSON.stringify(plan.drafts), accountId);
  await restoreThemes(themeStore, plan.newThemes);
  await restoreLanguages(plan.newLanguages, languageStore);
  setScoped(VOICE_GAINS_KEY, JSON.stringify(plan.voiceGains), accountId);
  if (plan.mentionPingEnabled !== null) {
    setScoped(MENTION_PING_KEY, plan.mentionPingEnabled ? "1" : "0", accountId);
  }
}
