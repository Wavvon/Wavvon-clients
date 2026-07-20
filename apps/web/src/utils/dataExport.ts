import type {
  Conversation,
  DmMessageFull,
  HomeHubList,
  RevocationEntry,
  SignedPrefsBlob,
  SubkeyCert,
} from "@shared/types";
import type { SavedHub } from "@platform";
import {
  getDmMessages as platformGetDmMessages,
  getHomeHubDesignation as platformGetHomeHubDesignation,
  getPrefsBlob as platformGetPrefsBlob,
  listConversations as platformListConversations,
  listDeviceCerts as platformListDeviceCerts,
  listDeviceRevocations as platformListDeviceRevocations,
  loadSavedHubs as platformLoadSavedHubs,
} from "@platform";
import { loadIdentity as platformLoadIdentity, publicKeyHex, masterPublicKeyHex, masterSeedHex } from "@identity/index";
import { derivePrefsBlobKey, decryptPrefsBlob, verifyPrefsBlob, type PrefsBlobContents } from "@wavvon/core";
import type { WavvonSkin } from "@wavvon/ui";
import { loadAllDrafts } from "./drafts";
import { loadCustomThemeStore } from "./customThemes";
import { getScoped } from "./accountScope";

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

export interface LocalPrefsSnapshot {
  hub_list: SavedHub[];
  theme: string;
  ignored_users: string[];
  voice_gains: Record<string, number>;
  mention_ping_enabled: boolean;
  // Decrypted hub-synced prefs (blocked users, cross-device voice settings) —
  // null when unavailable: a paired device holds no entropy to derive the
  // blob key from (only the entropy-holding device can), or nothing has been
  // published to the home hub yet.
  hub_synced: PrefsBlobContents | null;
  gap_note: string | null;
}

export interface ArchiveIdentity {
  seed_hex: string;
  security_nonce: number;
  security_level: number;
  // Present once this device has opted into multi-device pairing — see
  // masterPubkeyOf()/IdentityRecord. A paired device's seed_hex is its own
  // subkey seed, not the entropy that derives the master keypair.
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

export function buildDmArchiveConversation(
  conv: Conversation,
  messages: DmMessageFull[],
  myPubkey: string,
): DmArchiveConversation {
  const peers = conv.members.filter((m) => m !== myPubkey);
  return {
    peer_pubkey: peers.join(","),
    conv_type: conv.conv_type,
    messages: messages.map((m) => ({
      sent_at: m.created_at,
      direction: m.sender === myPubkey ? "out" : "in",
      body: m.content,
    })),
  };
}

export function buildLocalPrefsSnapshot(loadSavedHubs: () => SavedHub[] = platformLoadSavedHubs): LocalPrefsSnapshot {
  // Theme is device-level (shared across every account on this device), so
  // it's read unscoped; the rest are per-account preferences of the
  // identity being archived.
  let theme = "calm";
  try {
    const raw = localStorage.getItem("wavvon:appearance");
    if (raw) theme = (JSON.parse(raw) as { slot?: string }).slot ?? "calm";
  } catch {
    // ignore malformed local state
  }

  let ignored_users: string[] = [];
  try {
    ignored_users = JSON.parse(getScoped("wavvon.ignoredUsers") ?? "[]") as string[];
  } catch {
    // ignore malformed local state
  }

  let voice_gains: Record<string, number> = {};
  try {
    voice_gains = JSON.parse(getScoped("wavvon.voice_gains") ?? "{}") as Record<string, number>;
  } catch {
    // ignore malformed local state
  }

  return {
    hub_list: loadSavedHubs(),
    theme,
    ignored_users,
    voice_gains,
    mention_ping_enabled: getScoped("wavvon.mentionPing") !== "0",
    hub_synced: null,
    gap_note: null,
  };
}

/** Resolves the identity/master pubkey the hub keys designation, device, and
 * prefs-blob records under — a paired device's own seed is a subkey seed, not
 * the entropy the master keypair is HKDF-derived from (see HomeHubsSection.tsx). */
export function resolveMasterPubkey(identity: ArchiveIdentity): string {
  if (identity.subkey_cert && identity.master_pubkey) return identity.master_pubkey;
  return masterPublicKeyHex(identity.seed_hex);
}

// Fetches and decrypts the E2E-encrypted hub-synced prefs blob. Returns null
// (not an abort) for the two expected empty cases: a paired device with no
// local entropy to derive the blob key, or no blob published yet (404).
export async function resolveHubSyncedPrefs(
  identity: ArchiveIdentity,
  masterPubkey: string,
  getPrefsBlob: (masterPubkey: string) => Promise<SignedPrefsBlob | null>,
): Promise<PrefsBlobContents | null> {
  if (identity.subkey_cert) return null;
  const blob = await getPrefsBlob(masterPubkey);
  if (!blob) return null;
  if (!verifyPrefsBlob(blob)) throw new Error("Prefs blob signature verification failed.");
  const blobKey = derivePrefsBlobKey(masterSeedHex(identity.seed_hex));
  return decryptPrefsBlob(blob.ciphertext_hex, blobKey);
}

export function buildThemesSection(): WavvonSkin[] {
  return loadCustomThemeStore().themes.map((t) => t.skin);
}

export interface ArchiveFetchers {
  loadIdentity: () => Promise<ArchiveIdentity | null>;
  getHomeHubDesignation: (pubkey: string) => Promise<HomeHubList | null>;
  listDeviceCerts: (pubkey: string) => Promise<SubkeyCert[]>;
  listDeviceRevocations: (pubkey: string) => Promise<RevocationEntry[]>;
  getPrefsBlob: (masterPubkey: string) => Promise<SignedPrefsBlob | null>;
  listConversations: () => Promise<Conversation[]>;
  getDmMessages: (conversationId: string) => Promise<DmMessageFull[]>;
  loadSavedHubs: () => SavedHub[];
}

export const defaultArchiveFetchers: ArchiveFetchers = {
  loadIdentity: platformLoadIdentity,
  getHomeHubDesignation: platformGetHomeHubDesignation,
  listDeviceCerts: platformListDeviceCerts,
  listDeviceRevocations: platformListDeviceRevocations,
  getPrefsBlob: platformGetPrefsBlob,
  listConversations: platformListConversations,
  getDmMessages: platformGetDmMessages,
  loadSavedHubs: platformLoadSavedHubs,
};

export interface AssembleArchiveOptions {
  onProgress?: (done: number, total: number) => void;
}

// Assembles the full personal-axis archive (docs/docs/data-export.md §2-4).
// Any source fetch failure aborts and rejects rather than returning a
// silently-incomplete archive; a 404 designation (no home hub configured) is
// the one expected "empty" case and is handled inside getHomeHubDesignation.
export async function assembleArchive(
  opts: AssembleArchiveOptions = {},
  fetchers: ArchiveFetchers = defaultArchiveFetchers,
): Promise<ArchiveDocument> {
  const identity = await fetchers.loadIdentity();
  if (!identity) throw new Error("No identity found on this device.");
  // DM conversations are addressed by the device/canonical pubkey; the
  // designation, device-cert, and prefs-blob records are keyed by the
  // (HKDF-derived, distinct) master pubkey — see resolveMasterPubkey().
  const myPubkey = publicKeyHex(identity.seed_hex);
  const masterPubkey = resolveMasterPubkey(identity);

  const designation = await fetchers.getHomeHubDesignation(masterPubkey);
  const subkeyCerts = await fetchers.listDeviceCerts(masterPubkey);
  const revocations = await fetchers.listDeviceRevocations(masterPubkey);
  const hubSyncedPrefs = await resolveHubSyncedPrefs(identity, masterPubkey, fetchers.getPrefsBlob);

  const conversations = await fetchers.listConversations();
  const dms: DmArchiveConversation[] = [];
  opts.onProgress?.(0, conversations.length);
  for (let i = 0; i < conversations.length; i++) {
    const conv = conversations[i];
    const messages = await fetchers.getDmMessages(conv.id);
    dms.push(buildDmArchiveConversation(conv, messages, myPubkey));
    opts.onProgress?.(i + 1, conversations.length);
  }

  const prefs = buildLocalPrefsSnapshot(fetchers.loadSavedHubs);
  if (hubSyncedPrefs) {
    prefs.hub_synced = hubSyncedPrefs;
    prefs.gap_note = null;
  } else if (identity.subkey_cert) {
    prefs.gap_note =
      "This is a paired device — hub-synced preferences (blocked users, cross-device voice " +
      "settings) can only be decrypted from the entropy-holding device that set them up.";
  }

  return {
    version: ARCHIVE_DOCUMENT_VERSION,
    kind: ARCHIVE_KIND,
    exported_at: Math.floor(Date.now() / 1000),
    identity,
    home_hubs: { designations: designation ? [designation] : [] },
    devices: { subkey_certs: subkeyCerts, revocations },
    prefs,
    dms,
    themes: buildThemesSection(),
    drafts: loadAllDrafts(),
  };
}
