import type {
  Conversation,
  DmMessageFull,
  HomeHubList,
  RevocationEntry,
  SubkeyCert,
} from "@shared/types";
import type { SavedHub } from "@platform";
import {
  getDmMessages as platformGetDmMessages,
  getHomeHubDesignation as platformGetHomeHubDesignation,
  listConversations as platformListConversations,
  listDeviceCerts as platformListDeviceCerts,
  listDeviceRevocations as platformListDeviceRevocations,
  loadSavedHubs as platformLoadSavedHubs,
} from "@platform";
import { loadIdentity as platformLoadIdentity, publicKeyHex } from "@identity/index";
import type { WavvonSkin } from "../skinValidation";
import { loadAllDrafts } from "./drafts";
import { loadCustomThemeStore } from "./customThemes";

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
  // Hub-synced prefs (blocked users, cross-device sync) are E2E-encrypted and
  // the web client has no decrypt path for them yet — see data-export.md §3.
  gap_note: string;
}

export interface ArchiveIdentity {
  seed_hex: string;
  security_nonce: number;
  security_level: number;
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
  let theme = "calm";
  try {
    const raw = localStorage.getItem("wavvon:appearance");
    if (raw) theme = (JSON.parse(raw) as { slot?: string }).slot ?? "calm";
  } catch {
    // ignore malformed local state
  }

  let ignored_users: string[] = [];
  try {
    ignored_users = JSON.parse(localStorage.getItem("wavvon.ignoredUsers") ?? "[]") as string[];
  } catch {
    // ignore malformed local state
  }

  let voice_gains: Record<string, number> = {};
  try {
    voice_gains = JSON.parse(localStorage.getItem("wavvon.voice_gains") ?? "{}") as Record<string, number>;
  } catch {
    // ignore malformed local state
  }

  return {
    hub_list: loadSavedHubs(),
    theme,
    ignored_users,
    voice_gains,
    mention_ping_enabled: localStorage.getItem("wavvon.mentionPing") !== "0",
    gap_note:
      "Hub-synced encrypted preferences (blocked users, cross-device settings) are not yet " +
      "decrypted by the web client; only preferences held locally on this device are included.",
  };
}

export function buildThemesSection(): WavvonSkin[] {
  return loadCustomThemeStore().themes.map((t) => t.skin);
}

export interface ArchiveFetchers {
  loadIdentity: () => Promise<ArchiveIdentity | null>;
  getHomeHubDesignation: (pubkey: string) => Promise<HomeHubList | null>;
  listDeviceCerts: (pubkey: string) => Promise<SubkeyCert[]>;
  listDeviceRevocations: (pubkey: string) => Promise<RevocationEntry[]>;
  listConversations: () => Promise<Conversation[]>;
  getDmMessages: (conversationId: string) => Promise<DmMessageFull[]>;
  loadSavedHubs: () => SavedHub[];
}

export const defaultArchiveFetchers: ArchiveFetchers = {
  loadIdentity: platformLoadIdentity,
  getHomeHubDesignation: platformGetHomeHubDesignation,
  listDeviceCerts: platformListDeviceCerts,
  listDeviceRevocations: platformListDeviceRevocations,
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
  const myPubkey = publicKeyHex(identity.seed_hex);

  const designation = await fetchers.getHomeHubDesignation(myPubkey);
  const subkeyCerts = await fetchers.listDeviceCerts(myPubkey);
  const revocations = await fetchers.listDeviceRevocations(myPubkey);

  const conversations = await fetchers.listConversations();
  const dms: DmArchiveConversation[] = [];
  opts.onProgress?.(0, conversations.length);
  for (let i = 0; i < conversations.length; i++) {
    const conv = conversations[i];
    const messages = await fetchers.getDmMessages(conv.id);
    dms.push(buildDmArchiveConversation(conv, messages, myPubkey));
    opts.onProgress?.(i + 1, conversations.length);
  }

  return {
    version: ARCHIVE_DOCUMENT_VERSION,
    kind: ARCHIVE_KIND,
    exported_at: Math.floor(Date.now() / 1000),
    identity,
    home_hubs: { designations: designation ? [designation] : [] },
    devices: { subkey_certs: subkeyCerts, revocations },
    prefs: buildLocalPrefsSnapshot(fetchers.loadSavedHubs),
    dms,
    themes: buildThemesSection(),
    drafts: loadAllDrafts(),
  };
}
