import { getScoped, setScoped } from "./accountScope";

// Which local settings follow the identity rather than the machine.
//
// The rule: a setting is synced when it expresses a *choice about yourself*
// (how the app looks and sounds, what you want to be told about, who you'd
// rather not hear from). It is NOT synced when it names something physical
// about this machine — a microphone id means nothing on your phone — or when
// it is scratch state: unsent drafts, window geometry, ratchet sessions,
// session tokens, which account is currently switched in.
//
// The list is the only thing to maintain: values are carried as the raw
// strings localStorage already holds, so adding a setting here is the whole
// change. See docs/docs/multi-device.md for the blob this rides in.
interface SyncedKey {
  key: string;
  /** Namespaced under the active account by accountScope (most settings are). */
  scoped: boolean;
}

// ponytail: the unscoped keys below are device-global, shared by every account
// on this machine — with two identities in one browser, whichever one syncs
// last wins the theme. Scope them per-account if that ever bites; today they
// already behave that way locally.
// ponytail: the hub list rides here as last-writer-wins, like every other
// synced value. Two browsers open at once, each adding a different hub, and one
// addition is lost until it is re-added. A union merge would fix that and break
// removal instead (a hub deleted on one device comes back from the other), so
// LWW is the honest default — revisit with a tombstone if it bites.
export const SYNCED_KEYS: SyncedKey[] = [
  { key: "wavvon:saved_hubs", scoped: true },
  { key: "wavvon:appearance", scoped: false },
  { key: "wavvon_language", scoped: false },
  { key: "wavvon.audio_profile", scoped: false },
  { key: "wavvon.ptt", scoped: false },
  { key: "wavvon.mentionPing", scoped: true },
  { key: "wavvon.voiceSounds", scoped: true },
  { key: "wavvon.presence", scoped: true },
  { key: "wavvon.ignoredUsers", scoped: true },
  { key: "wavvon.voice_gains", scoped: true },
  { key: "wavvon.notifyMode.hub", scoped: true },
  { key: "wavvon.notifyMode.channel", scoped: true },
  { key: "wavvon.pinnedChannels", scoped: true },
  { key: "wavvon.collapsedCategories", scoped: true },
  { key: "wavvon.hideSilenced", scoped: true },
  { key: "wavvon.hideBirthdays", scoped: true },
  { key: "wavvon.customThemes", scoped: true },
  { key: "wavvon.trustedIssuers", scoped: true },
];

function read(k: SyncedKey): string | null {
  try {
    return k.scoped ? getScoped(k.key) : localStorage.getItem(k.key);
  } catch {
    return null;
  }
}

function write(k: SyncedKey, value: string): void {
  try {
    if (k.scoped) setScoped(k.key, value);
    else localStorage.setItem(k.key, value);
  } catch {
    // storage unavailable — nothing to do
  }
}

/** Snapshot of every synced setting that has a value. Unset keys are omitted
 *  rather than sent as null, so a device that never touched a setting does
 *  not overwrite another device's choice with "no opinion". */
export function collectSyncedSettings(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of SYNCED_KEYS) {
    const v = read(k);
    if (v !== null) out[k.key] = v;
  }
  return out;
}

/** Write a pulled snapshot into local storage. Returns true if anything
 *  actually changed — the caller uses that to decide whether a reload is
 *  needed (language and theme are read once at boot) and, because it is false
 *  in the steady state, it cannot loop. Keys absent from the snapshot are left
 *  alone: this merges, it never clears. */
export function applySyncedSettings(settings: Record<string, string>): boolean {
  let changed = false;
  for (const k of SYNCED_KEYS) {
    const incoming = settings[k.key];
    if (typeof incoming !== "string") continue;
    if (read(k) === incoming) continue;
    write(k, incoming);
    changed = true;
  }
  return changed;
}
