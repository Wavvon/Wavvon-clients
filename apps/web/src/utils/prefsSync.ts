import {
  derivePrefsBlobKey,
  decryptPrefsBlob,
  encryptPrefsBlob,
  verifyPrefsBlob,
  buildPrefsBlob,
  masterSeedHex,
  masterPublicKeyHex,
  type PrefsBlobContents,
  type SavedSticker,
  type SignedPrefsBlob,
} from "@wavvon/core";
import { holdsMasterSeed, loadIdentity, type IdentityRecord } from "../identity/store";
import { getHomeHubDesignation, getPrefsBlobFrom, putPrefsBlobTo } from "../platform/commands/identity";
import { allSessions, getActiveHubId, getSession } from "../platform/session";
import { collectSyncedSettings, applySyncedSettings } from "./syncedSettings";

// Cross-device settings, riding the encrypted prefs blob the home-hub layer
// already defines (docs/docs/home-hub.md "Prefs blob"). The hub stores
// ciphertext and a version counter and verifies nothing but the master
// signature; the key is HKDF'd from the master seed, so the hub cannot read
// what it holds.
//
// The desktop client has had a push/pull round trip since multi-device
// landed; the web client only ever read the blob (for the backup export).
// This is the missing half — without it a second browser, or a restored
// identity, starts from factory defaults.

/** How often the local snapshot is compared against what was last pushed. */
const PUSH_POLL_MS = 5_000;

// ponytail: pull once per page load, push continuously. Settings follow you to
// a new device or a new session, but a change made on another device while
// this one is open does not land until it reloads. Live propagation needs a
// per-setting answer to "can this hot-apply?" (language and theme cannot),
// which is a bigger design than this is worth today.

// ponytail: a diff poll rather than a hook on every settings write. There are
// a dozen write sites across hooks, tabs and components, and a poll catches
// all of them plus every future one — the cost is ~16 localStorage reads and
// a JSON.stringify every 5s, and the network is touched only on a real change.
// Swap for an explicit notifier if the write sites ever consolidate.

interface Target {
  url: string;
}

/** Where this identity's blob lives: the hubs it designated as home, or —
 *  with no designation published — whatever hubs this session is connected
 *  to, so the sync works before the user has set anything up. */
async function resolveTargets(masterPubkey: string): Promise<Target[]> {
  const urls = new Set<string>();
  try {
    const designation = await getHomeHubDesignation(masterPubkey);
    for (const u of designation?.hubs ?? []) urls.add(u.replace(/\/+$/, ""));
  } catch {
    // No designation, or the active hub is too old to serve one.
  }
  if (urls.size === 0) {
    for (const s of allSessions()) urls.add(s.hub_url.replace(/\/+$/, ""));
  }
  // The active hub goes first: it is the one most likely to answer.
  const active = getActiveHubId();
  const activeUrl = active ? getSession(active)?.hub_url.replace(/\/+$/, "") : undefined;
  const ordered = [...urls].sort((a, b) => (a === activeUrl ? -1 : b === activeUrl ? 1 : 0));
  return ordered.map((url) => ({ url }));
}

interface Fetched {
  version: number;
  contents: PrefsBlobContents;
}

/** Highest-versioned blob any target holds. A blob whose signature does not
 *  verify is discarded rather than trusted — the hub is not trusted to hold
 *  it faithfully, which is the whole point of signing it. */
async function fetchBest(targets: Target[], masterPubkey: string, blobKey: Uint8Array): Promise<Fetched | null> {
  let best: Fetched | null = null;
  for (const t of targets) {
    let blob: SignedPrefsBlob | null = null;
    try {
      blob = await getPrefsBlobFrom(t.url, masterPubkey);
    } catch {
      continue;
    }
    if (!blob || !verifyPrefsBlob(blob)) continue;
    if (best && blob.blob_version <= best.version) continue;
    try {
      best = { version: blob.blob_version, contents: decryptPrefsBlob(blob.ciphertext_hex, blobKey) };
    } catch {
      // Wrong key or corrupt ciphertext — treat as no blob here.
    }
  }
  return best;
}

/** A paired device holds a subkey seed, not the entropy the master key is
 *  derived from, so it cannot derive the blob key at all (the wrapped-key
 *  handoff at pairing is not implemented on web yet — see
 *  docs/docs/client-parity.md). Such a device syncs nothing rather than
 *  silently writing a blob nobody else can read. */
function canSync(identity: IdentityRecord): boolean {
  return holdsMasterSeed(identity);
}

export interface StickerCollectionApi {
  get: () => SavedSticker[];
  /** Applies `fn` to the newest list and pushes it. A refused push (another
   *  device won the version race) re-reads the blob and applies `fn` once
   *  more to what is there now, so a concurrent save is merged, not erased. */
  mutate: (fn: (list: SavedSticker[]) => SavedSticker[]) => Promise<SavedSticker[]>;
}

export interface PrefsSyncHandle {
  stop: () => void;
  stickers: StickerCollectionApi;
}

let activeCollection: StickerCollectionApi | null = null;
const collectionListeners = new Set<() => void>();

/** Null on a device that cannot sync: only the device holding the master seed
 *  can write the blob (stickers.md, v1). */
export function getStickerCollection(): StickerCollectionApi | null {
  return activeCollection;
}

export function subscribeStickerCollection(fn: () => void): () => void {
  collectionListeners.add(fn);
  return () => { collectionListeners.delete(fn); };
}

function setCollection(api: StickerCollectionApi | null): void {
  activeCollection = api;
  collectionListeners.forEach((fn) => fn());
}

/** Pull once, apply, then keep pushing local changes. Resolves after the pull
 *  so the caller can reload if the pulled values need a boot to take effect.
 *  Returns null when this device cannot sync. */
export async function startPrefsSync(onPulledChange: () => void): Promise<PrefsSyncHandle | null> {
  const identity = await loadIdentity();
  if (!identity || !canSync(identity)) return null;

  const masterPubkey = masterPublicKeyHex(identity.seed_hex);
  const seed = masterSeedHex(identity.seed_hex);
  const blobKey = derivePrefsBlobKey(seed);

  const targets = await resolveTargets(masterPubkey);
  if (targets.length === 0) return null;

  // --- Pull ---
  const remote = await fetchBest(targets, masterPubkey, blobKey);
  // Anything the blob already held that this client does not manage (desktop's
  // typed voice_settings and blocked_users) is carried forward untouched on
  // every push below — dropping it would make the two clients fight.
  let base: PrefsBlobContents = remote?.contents ?? { blocked_users: [], voice_settings: {} };
  let version = remote?.version ?? 0;

  if (remote) {
    const incoming = remote.contents.settings ?? {};
    // hide_birthdays predates the generic map and desktop still writes it as a
    // typed field; fold it in when the map does not carry the key itself.
    if (incoming["wavvon.hideBirthdays"] === undefined && typeof remote.contents.hide_birthdays === "boolean") {
      incoming["wavvon.hideBirthdays"] = String(remote.contents.hide_birthdays);
    }
    if (applySyncedSettings(incoming)) onPulledChange();
  }

  // --- Push ---
  let lastPushed = JSON.stringify(collectSyncedSettings());

  async function push(overrides: Partial<PrefsBlobContents> = {}): Promise<boolean> {
    const settings = collectSyncedSettings();
    const contents: PrefsBlobContents = {
      ...base,
      ...overrides,
      settings,
      hide_birthdays: settings["wavvon.hideBirthdays"] === "true",
    };
    const ciphertextHex = encryptPrefsBlob(contents, blobKey);
    version += 1;
    const blob = buildPrefsBlob(seed, masterPubkey, version, ciphertextHex);
    let accepted = false;
    for (const t of targets) {
      try {
        await putPrefsBlobTo(t.url, blob);
        accepted = true;
      } catch {
        // Unreachable hub, or another device won the version race. Either way
        // the next tick re-reads and retries — the blob is small and the loser
        // has nothing to merge, since only this user writes their own blob.
      }
    }
    if (accepted) {
      base = contents;
      return true;
    }
    // Every target refused: most likely a stale version counter (409). Re-read
    // the highest version so the next attempt lands above it.
    const fresh = await fetchBest(targets, masterPubkey, blobKey);
    if (fresh && fresh.version >= version) {
      version = fresh.version;
      base = fresh.contents;
    }
    return false;
  }

  // Pushes share one version counter, so two in flight would refuse each other.
  let chain: Promise<unknown> = Promise.resolve();
  function serial<T>(job: () => Promise<T>): Promise<T> {
    const run = chain.then(job);
    chain = run.catch(() => undefined);
    return run;
  }

  const stickers: StickerCollectionApi = {
    get: () => base.stickers ?? [],
    mutate: (fn) => serial(async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const next = fn(base.stickers ?? []);
        if (await push({ stickers: next })) {
          collectionListeners.forEach((l) => l());
          return next;
        }
      }
      throw new Error("sticker collection not saved");
    }),
  };

  let pushing = false;
  const timer = setInterval(() => {
    const snapshot = JSON.stringify(collectSyncedSettings());
    if (snapshot === lastPushed || pushing) return;
    lastPushed = snapshot;
    pushing = true;
    void serial(() => push()).finally(() => { pushing = false; });
  }, PUSH_POLL_MS);

  // Nothing published yet and we do have local settings: seed the blob now so
  // a second device has something to pull without waiting for an edit here.
  if (!remote) void serial(() => push());

  setCollection(stickers);
  return {
    stickers,
    stop: () => {
      clearInterval(timer);
      if (activeCollection === stickers) setCollection(null);
    },
  };
}
