import type { SavedHub } from "@platform";
import type { WavvonSkin } from "../skinValidation";
import type { NamedCustomTheme } from "./customThemes";
import { getScoped, setScoped } from "./accountScope";
import { loadCustomThemeStore, saveCustomThemeStore, newCustomThemeId } from "./customThemes";
import { ARCHIVE_KIND, ARCHIVE_DOCUMENT_VERSION, type ArchiveDocument } from "./dataExport";

// Import/restore half of the full-archive feature (docs/docs/data-export.md
// §5). Decode + merge logic is kept pure and side-effect free here so it's
// unit-testable without touching localStorage; readExistingAccountSnapshot /
// applyRestorePlan below are the only impure pieces, and they always take an
// explicit accountId so a restore never touches the currently active
// account's data unless that happens to be the one being restored into.

const SAVED_HUBS_KEY = "wavvon:saved_hubs";
const DRAFTS_KEY = "wavvon.drafts";
const IGNORED_USERS_KEY = "wavvon.ignoredUsers";
const VOICE_GAINS_KEY = "wavvon.voice_gains";
const MENTION_PING_KEY = "wavvon.mentionPing";

// The archive's `identity` section is whatever fields happened to be on the
// exporting device's IdentityRecord (dataExport.ts's ArchiveIdentity type
// only promises the baseline three, but the multi-device fields ride along
// at runtime) — read leniently, same fields resolveOrCreateAccount accepts
// for the plain identity-backup import (IdentityBackupSection.tsx).
export interface ArchiveIdentityInput {
  seed_hex: string;
  master_pubkey?: string;
  device_label?: string;
  subkey_cert?: unknown;
  account_label?: string;
}

export interface ExistingAccountSnapshot {
  hubList: SavedHub[];
  drafts: Record<string, string>;
  themeNames: string[];
  ignoredUsers: string[];
  voiceGains: Record<string, number>;
  hasMentionPingSetting: boolean;
}

export interface RestorePlan {
  hubList: SavedHub[];
  drafts: Record<string, string>;
  newThemes: NamedCustomTheme[];
  ignoredUsers: string[];
  voiceGains: Record<string, number>;
  mentionPingEnabled: boolean | null;
  summary: RestoreSummary;
}

export interface RestoreSummary {
  hubsRestored: number;
  hubsSkipped: number;
  draftsRestored: number;
  draftsSkipped: number;
  themesRestored: number;
  themesSkipped: number;
  ignoredUsersRestored: number;
  ignoredUsersSkipped: number;
  voiceGainsRestored: number;
  voiceGainsSkipped: number;
  mentionPingRestored: boolean;
  mentionPingSkipped: boolean;
  dmConversations: number;
  dmMessages: number;
  // Things the archive holds that this import path can't write anywhere —
  // reported to the user rather than silently dropped (data-export.md §5).
  unrestorable: string[];
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function parseArchiveDocument(json: string): ArchiveDocument {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    throw new Error("Archive contents are not valid JSON.");
  }
  if (!doc || typeof doc !== "object") throw new Error("Malformed archive: not an object.");
  const d = doc as Record<string, unknown>;

  if (d.kind !== ARCHIVE_KIND) throw new Error("This file isn't a full Wavvon archive.");
  if (typeof d.version !== "number" || d.version > ARCHIVE_DOCUMENT_VERSION) {
    throw new Error("This archive was made by a newer version of Wavvon.");
  }

  const identity = d.identity as Record<string, unknown> | undefined;
  if (!identity || typeof identity.seed_hex !== "string" || !identity.seed_hex) {
    throw new Error("Malformed archive: missing identity.");
  }
  if (!Array.isArray(d.dms)) throw new Error("Malformed archive: missing DM section.");
  if (!Array.isArray(d.themes)) throw new Error("Malformed archive: missing themes section.");
  if (!d.drafts || typeof d.drafts !== "object") throw new Error("Malformed archive: missing drafts section.");
  const prefs = d.prefs as Record<string, unknown> | undefined;
  if (!prefs || !Array.isArray(prefs.hub_list) || !Array.isArray(prefs.ignored_users)) {
    throw new Error("Malformed archive: missing prefs section.");
  }

  return doc as ArchiveDocument;
}

export interface PlanRestoreOptions {
  idFactory?: () => string;
}

export function planRestore(
  archive: ArchiveDocument,
  existing: ExistingAccountSnapshot,
  opts: PlanRestoreOptions = {},
): RestorePlan {
  const idFactory = opts.idFactory ?? newCustomThemeId;

  const existingHubIds = new Set(existing.hubList.map((h) => h.hub_id));
  const newHubs = archive.prefs.hub_list.filter((h) => !existingHubIds.has(h.hub_id));
  const hubsSkipped = archive.prefs.hub_list.length - newHubs.length;
  const hubList = [...existing.hubList, ...newHubs];

  const drafts: Record<string, string> = { ...existing.drafts };
  let draftsRestored = 0;
  let draftsSkipped = 0;
  for (const [key, text] of Object.entries(archive.drafts)) {
    if (Object.prototype.hasOwnProperty.call(existing.drafts, key)) {
      draftsSkipped++;
    } else {
      drafts[key] = text;
      draftsRestored++;
    }
  }

  const existingThemeNames = new Set(existing.themeNames);
  const newThemes: NamedCustomTheme[] = [];
  let themesSkipped = 0;
  for (const skin of archive.themes as WavvonSkin[]) {
    const name = (skin.name && skin.name.trim()) || "Restored theme";
    if (existingThemeNames.has(name)) {
      themesSkipped++;
      continue;
    }
    existingThemeNames.add(name);
    newThemes.push({ id: idFactory(), name, skin: { ...skin, name } });
  }

  const ignoredUsers = [...existing.ignoredUsers];
  const existingIgnored = new Set(existing.ignoredUsers);
  let ignoredUsersRestored = 0;
  let ignoredUsersSkipped = 0;
  for (const u of archive.prefs.ignored_users) {
    if (existingIgnored.has(u)) {
      ignoredUsersSkipped++;
    } else {
      existingIgnored.add(u);
      ignoredUsers.push(u);
      ignoredUsersRestored++;
    }
  }

  const voiceGains: Record<string, number> = { ...existing.voiceGains };
  let voiceGainsRestored = 0;
  let voiceGainsSkipped = 0;
  for (const [key, val] of Object.entries(archive.prefs.voice_gains)) {
    if (Object.prototype.hasOwnProperty.call(existing.voiceGains, key)) {
      voiceGainsSkipped++;
    } else {
      voiceGains[key] = val;
      voiceGainsRestored++;
    }
  }

  const mentionPingRestored = !existing.hasMentionPingSetting;
  const mentionPingEnabled = mentionPingRestored ? archive.prefs.mention_ping_enabled : null;

  const dmMessages = archive.dms.reduce((sum, c) => sum + c.messages.length, 0);

  const unrestorable: string[] = archive.prefs.gap_note ? [archive.prefs.gap_note] : [];
  if (archive.dms.length > 0) {
    unrestorable.push(
      `DM history in this archive (${archive.dms.length} conversation(s), ${dmMessages} message(s)) is not re-imported — a synced home hub already re-delivers live history to this account; the archive stays the readable copy for when that hub is gone.`,
    );
  }
  if (archive.home_hubs.designations.length > 0 || archive.devices.subkey_certs.length > 0 || archive.devices.revocations.length > 0) {
    unrestorable.push(
      "Home-hub designation and device certificates are records the hub holds for this identity; they're re-established automatically once this account connects there, not written locally.",
    );
  }

  return {
    hubList,
    drafts,
    newThemes,
    ignoredUsers,
    voiceGains,
    mentionPingEnabled,
    summary: {
      hubsRestored: newHubs.length,
      hubsSkipped,
      draftsRestored,
      draftsSkipped,
      themesRestored: newThemes.length,
      themesSkipped,
      ignoredUsersRestored,
      ignoredUsersSkipped,
      voiceGainsRestored,
      voiceGainsSkipped,
      mentionPingRestored,
      mentionPingSkipped: !mentionPingRestored,
      dmConversations: archive.dms.length,
      dmMessages,
      unrestorable,
    },
  };
}

// Aggregate counters used for the one-line restore summary shown to the
// user; kept separate from RestoreSummary's per-field detail so the UI copy
// can change without touching the merge logic.
export function totalRestored(summary: RestoreSummary): number {
  return (
    summary.hubsRestored +
    summary.draftsRestored +
    summary.themesRestored +
    summary.ignoredUsersRestored +
    summary.voiceGainsRestored +
    (summary.mentionPingRestored ? 1 : 0)
  );
}

export function totalSkipped(summary: RestoreSummary): number {
  return (
    summary.hubsSkipped +
    summary.draftsSkipped +
    summary.themesSkipped +
    summary.ignoredUsersSkipped +
    summary.voiceGainsSkipped +
    (summary.mentionPingSkipped ? 1 : 0)
  );
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
