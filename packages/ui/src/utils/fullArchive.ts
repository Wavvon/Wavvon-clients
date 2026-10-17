import type { HomeHubList, PrefsBlobContents, RevocationEntry, SubkeyCert } from "@wavvon/core";
import type { WavvonSkin } from "../skinValidation";

// The full personal-data archive document (docs wiki data-export.md §2-5) and
// the merge rule a restore applies. Both clients read and write this shape —
// desktop assembles its half in Rust (archive.rs) — and both restore through
// planRestore, so "union, never overwrite" has exactly one implementation.

export const ARCHIVE_KIND = "full-archive" as const;
export const ARCHIVE_DOCUMENT_VERSION = 1;

export interface DmArchiveMessage {
  sent_at: number;
  direction: "in" | "out";
  body: string;
}

export interface DmArchiveConversation {
  peer_pubkey: string;
  conv_type: string;
  messages: DmArchiveMessage[];
}

/** The fields a restore needs; a web export carries web's whole SavedHub. */
export interface ArchiveHub {
  hub_id: string;
  hub_name: string;
  hub_url: string;
}

export interface LocalPrefsSnapshot {
  hub_list: ArchiveHub[];
  theme: string;
  ignored_users: string[];
  /** Percent, 100 = unchanged. */
  voice_gains: Record<string, number>;
  mention_ping_enabled: boolean;
  // Decrypted hub-synced prefs — null when a paired device holds no entropy
  // to derive the blob key from, or nothing has been published yet.
  hub_synced: PrefsBlobContents | null;
  gap_note: string | null;
}

export interface ArchiveIdentity {
  seed_hex: string;
  security_nonce: number;
  security_level: number;
  // A paired device's seed_hex is its own subkey seed, not the entropy the
  // master keypair derives from.
  master_pubkey?: string;
  subkey_cert?: unknown;
}

export interface ArchiveDocument {
  version: number;
  kind: typeof ARCHIVE_KIND;
  exported_at: number;
  identity: ArchiveIdentity;
  home_hubs: { designations: HomeHubList[] };
  devices: { subkey_certs: SubkeyCert[]; revocations: RevocationEntry[] };
  prefs: LocalPrefsSnapshot;
  dms: DmArchiveConversation[];
  themes: WavvonSkin[];
  drafts: Record<string, string>;
}

/** What a restore plans against: the document minus its identity, which on
 *  desktop never leaves Rust. */
export type RestorableArchive = Omit<ArchiveDocument, "identity">;

export function buildDmArchiveConversation(
  conv: { conv_type: string; members: string[] },
  messages: { created_at: number; sender: string; content: string }[],
  myPubkey: string,
): DmArchiveConversation {
  return {
    peer_pubkey: conv.members.filter((m) => m !== myPubkey).join(","),
    conv_type: conv.conv_type,
    messages: messages.map((m) => ({
      sent_at: m.created_at,
      direction: m.sender === myPubkey ? "out" : "in",
      body: m.content,
    })),
  };
}

/** Throws "malformed_archive", "unsupported_archive_format" (not a full
 *  archive) or "archive_too_new". desktop's archive.rs validates the same
 *  sections in the same way. */
export function parseArchiveDocument(json: string): ArchiveDocument {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    throw new Error("malformed_archive");
  }
  if (!doc || typeof doc !== "object") throw new Error("malformed_archive");
  const d = doc as Record<string, unknown>;
  if (d.kind !== ARCHIVE_KIND) throw new Error("unsupported_archive_format");
  if (typeof d.version !== "number" || d.version > ARCHIVE_DOCUMENT_VERSION) throw new Error("archive_too_new");

  const identity = d.identity as Record<string, unknown> | undefined;
  const prefs = d.prefs as Record<string, unknown> | undefined;
  if (
    !identity ||
    typeof identity.seed_hex !== "string" ||
    !identity.seed_hex ||
    !Array.isArray(d.dms) ||
    !Array.isArray(d.themes) ||
    !d.drafts ||
    typeof d.drafts !== "object" ||
    !prefs ||
    !Array.isArray(prefs.hub_list) ||
    !Array.isArray(prefs.ignored_users)
  ) {
    throw new Error("malformed_archive");
  }
  return doc as ArchiveDocument;
}

export interface ExistingAccountSnapshot {
  hubList: ArchiveHub[];
  drafts: Record<string, string>;
  themeNames: string[];
  ignoredUsers: string[];
  voiceGains: Record<string, number>;
  hasMentionPingSetting: boolean;
}

export interface RestoredTheme {
  id: string;
  name: string;
  skin: WavvonSkin;
}

/** Things the archive holds that a restore cannot write anywhere — reported,
 *  never silently dropped (data-export.md §5). */
export type UnrestorableNote =
  | { kind: "prefs_gap" }
  | { kind: "dm_history"; conversations: number; messages: number }
  | { kind: "hub_records" };

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
  unrestorable: UnrestorableNote[];
}

export interface RestorePlan {
  hubList: ArchiveHub[];
  drafts: Record<string, string>;
  newThemes: RestoredTheme[];
  ignoredUsers: string[];
  voiceGains: Record<string, number>;
  mentionPingEnabled: boolean | null;
  summary: RestoreSummary;
}

// Union, never overwrite: whatever the account already has wins, the archive
// only fills gaps.
export function planRestore(
  archive: RestorableArchive,
  existing: ExistingAccountSnapshot,
  idFactory: () => string,
): RestorePlan {
  const existingHubIds = new Set(existing.hubList.map((h) => h.hub_id));
  const newHubs = archive.prefs.hub_list.filter((h) => !existingHubIds.has(h.hub_id));

  const drafts = mergeRecord(existing.drafts, archive.drafts);
  const voiceGains = mergeRecord(existing.voiceGains, archive.prefs.voice_gains);

  const themeNames = new Set(existing.themeNames);
  const newThemes: RestoredTheme[] = [];
  for (const skin of archive.themes) {
    const name = skin.name?.trim() || "Restored theme";
    if (themeNames.has(name)) continue;
    themeNames.add(name);
    newThemes.push({ id: idFactory(), name, skin: { ...skin, name } });
  }

  const ignored = new Set(existing.ignoredUsers);
  const newIgnored = archive.prefs.ignored_users.filter((u) => !ignored.has(u) && ignored.add(u));

  const mentionPingRestored = !existing.hasMentionPingSetting;
  const dmMessages = archive.dms.reduce((sum, c) => sum + c.messages.length, 0);

  const unrestorable: UnrestorableNote[] = archive.prefs.gap_note ? [{ kind: "prefs_gap" }] : [];
  if (archive.dms.length > 0) {
    unrestorable.push({ kind: "dm_history", conversations: archive.dms.length, messages: dmMessages });
  }
  if (
    archive.home_hubs.designations.length > 0 ||
    archive.devices.subkey_certs.length > 0 ||
    archive.devices.revocations.length > 0
  ) {
    unrestorable.push({ kind: "hub_records" });
  }

  return {
    hubList: [...existing.hubList, ...newHubs],
    drafts: drafts.merged,
    newThemes,
    ignoredUsers: [...existing.ignoredUsers, ...newIgnored],
    voiceGains: voiceGains.merged,
    mentionPingEnabled: mentionPingRestored ? archive.prefs.mention_ping_enabled : null,
    summary: {
      hubsRestored: newHubs.length,
      hubsSkipped: archive.prefs.hub_list.length - newHubs.length,
      draftsRestored: drafts.added,
      draftsSkipped: drafts.skipped,
      themesRestored: newThemes.length,
      themesSkipped: archive.themes.length - newThemes.length,
      ignoredUsersRestored: newIgnored.length,
      ignoredUsersSkipped: archive.prefs.ignored_users.length - newIgnored.length,
      voiceGainsRestored: voiceGains.added,
      voiceGainsSkipped: voiceGains.skipped,
      mentionPingRestored,
      mentionPingSkipped: !mentionPingRestored,
      dmConversations: archive.dms.length,
      dmMessages,
      unrestorable,
    },
  };
}

function mergeRecord<T>(existing: Record<string, T>, incoming: Record<string, T>) {
  const merged = { ...existing };
  let added = 0;
  let skipped = 0;
  for (const [key, value] of Object.entries(incoming)) {
    if (Object.prototype.hasOwnProperty.call(existing, key)) {
      skipped++;
    } else {
      merged[key] = value;
      added++;
    }
  }
  return { merged, added, skipped };
}

export function totalRestored(s: RestoreSummary): number {
  return s.hubsRestored + s.draftsRestored + s.themesRestored + s.ignoredUsersRestored + s.voiceGainsRestored + (s.mentionPingRestored ? 1 : 0);
}

export function totalSkipped(s: RestoreSummary): number {
  return s.hubsSkipped + s.draftsSkipped + s.themesSkipped + s.ignoredUsersSkipped + s.voiceGainsSkipped + (s.mentionPingSkipped ? 1 : 0);
}
