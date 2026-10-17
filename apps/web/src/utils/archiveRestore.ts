import type { SavedHub } from "@platform";
import type { ExistingAccountSnapshot, RestorePlan } from "@wavvon/ui";
import { getScoped, setScoped } from "./accountScope";
import { loadCustomThemeStore, saveCustomThemeStore } from "./customThemes";

// Web's storage half of a full-archive restore (docs/docs/data-export.md §5);
// the merge rule itself is the shared planRestore. Both functions take an
// explicit accountId so a restore never touches the active account's data
// unless that is the one being restored into.

const SAVED_HUBS_KEY = "wavvon:saved_hubs";
const DRAFTS_KEY = "wavvon.drafts";
const IGNORED_USERS_KEY = "wavvon.ignoredUsers";
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

export function readExistingAccountSnapshot(accountId: string): ExistingAccountSnapshot {
  return {
    hubList: safeJsonParse<SavedHub[]>(getScoped(SAVED_HUBS_KEY, accountId), []),
    drafts: safeJsonParse<Record<string, string>>(getScoped(DRAFTS_KEY, accountId), {}),
    themeNames: loadCustomThemeStore(accountId).themes.map((t) => t.name),
    ignoredUsers: safeJsonParse<string[]>(getScoped(IGNORED_USERS_KEY, accountId), []),
    voiceGains: safeJsonParse<Record<string, number>>(getScoped(VOICE_GAINS_KEY, accountId), {}),
    hasMentionPingSetting: getScoped(MENTION_PING_KEY, accountId) !== null,
  };
}

export function applyRestorePlan(accountId: string, plan: RestorePlan): void {
  setScoped(SAVED_HUBS_KEY, JSON.stringify(plan.hubList), accountId);
  setScoped(DRAFTS_KEY, JSON.stringify(plan.drafts), accountId);
  if (plan.newThemes.length > 0) {
    const store = loadCustomThemeStore(accountId);
    saveCustomThemeStore({ ...store, themes: [...store.themes, ...plan.newThemes] }, accountId);
  }
  setScoped(IGNORED_USERS_KEY, JSON.stringify(plan.ignoredUsers), accountId);
  setScoped(VOICE_GAINS_KEY, JSON.stringify(plan.voiceGains), accountId);
  if (plan.mentionPingEnabled !== null) {
    setScoped(MENTION_PING_KEY, plan.mentionPingEnabled ? "1" : "0", accountId);
  }
}
