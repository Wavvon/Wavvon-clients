import { openDB, type IDBPDatabase } from "idb";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes, publicKeyHex, masterPublicKeyHex, type SubkeyCert } from "@wavvon/core";
import { sortAccountsByOrder, renumberAccountOrder, nextAccountOrder } from "./accountOrder";

// Accounts are device-local: this file is the only place that reads/writes
// the "identity" object store and the active-account pointer. Nothing here
// ever talks to a hub or touches personal-axis (hub-synced) state.

export interface IdentityRecord {
  // The account id is the identity's own Ed25519 public key (hex), derived
  // from seed_hex — stable, collision-free, and derivable offline without a
  // second source of truth. A paired subkey device gets its own row keyed by
  // its own subkey pubkey; canonical_pubkey below is what the hub attributes
  // its actions to.
  id: string;
  seed_hex: string;
  security_nonce: number;
  security_level: number;
  // Multi-device: once the user opts into pairing, we persist the master
  // pubkey and this device's own subkey cert. When present, the cert is sent
  // at auth so the hub resolves this device to the shared canonical identity.
  master_pubkey?: string;
  device_label?: string;
  subkey_cert?: SubkeyCert;
  // The canonical identity the hub attributes this device's actions to. For a
  // paired device this differs from publicKeyHex(seed_hex); the UI uses it to
  // self-identify. Learned from the auth/verify response.
  canonical_pubkey?: string;
  // Paired device only: the canonical (subkey-0/entropy) DM DH X25519
  // *private scalar*, unwrapped at pairing completion from
  // `PairingComplete.wrapped_dh_seed_hex` (decisions.md "DH capability via a
  // wrapped canonical scalar"). Lets this device agree on E2E DM keys as the
  // canonical identity without ever holding a signing seed. Hex-encoded.
  canonical_dh_priv_hex?: string;
  // Purely local nickname shown in the account switcher so multiple accounts
  // on one device are easy to tell apart. Never sent to a hub.
  account_label?: string;
  // Purely local display position in the account switcher/backup lists.
  // Same nature as account_label: device-local, never synced to a hub.
  // Missing on accounts created before this field existed — those sort last
  // (see accountOrder.ts) until the user drags them or a new account bumps
  // past them.
  account_order?: number;
}

// Single source of truth for "which account is active" — deliberately plain
// localStorage rather than the IndexedDB "meta" store so every other
// per-account localStorage key (see utils/accountScope.ts) can resolve it
// synchronously without awaiting a DB open.
const ACTIVE_ACCOUNT_KEY = "wavvon:active_account_id";

let _db: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (!_db) {
    _db = await openDB("wavvon", 2, {
      upgrade(db, oldVersion) {
        // v1 kept a single row hardcoded to id "main". That id has no
        // relationship to an account's actual pubkey, so it can't be
        // reinterpreted as an account id — the store is recreated empty and
        // the device falls back to the identity setup screen, same as any
        // other fresh install. No carry-over is attempted.
        if (oldVersion < 2 && db.objectStoreNames.contains("identity")) {
          db.deleteObjectStore("identity");
        }
        if (!db.objectStoreNames.contains("identity")) {
          db.createObjectStore("identity", { keyPath: "id" });
        }
      },
    });
  }
  return _db;
}

export function getActiveAccountId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

export function setActiveAccountId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_ACCOUNT_KEY, id);
    else localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
  } catch {
    // storage unavailable
  }
}

// The account registry is just every row in the identity store — there is no
// separate list to keep in sync.
export async function listAccounts(): Promise<IdentityRecord[]> {
  const db = await getDb();
  return db.getAll("identity");
}

// Same rows as listAccounts, in the user's chosen display order (see
// accountOrder.ts). Every place that lists accounts for a human — the
// switcher table, backup export's account picker — should use this instead
// of the raw, effectively-arbitrary IndexedDB enumeration order.
export async function listAccountsOrdered(): Promise<IdentityRecord[]> {
  return sortAccountsByOrder(await listAccounts());
}

// Persists a full reorder pass: writes sequential account_order values
// matching idsInOrder's position in one pass over the store.
export async function setAccountOrder(idsInOrder: string[]): Promise<void> {
  const db = await getDb();
  const positions = renumberAccountOrder(idsInOrder);
  const all = await db.getAll("identity");
  for (const record of all) {
    const position = positions.get(record.id);
    if (position != null && record.account_order !== position) {
      await db.put("identity", { ...record, account_order: position });
    }
  }
}

export async function loadIdentity(): Promise<IdentityRecord | null> {
  const db = await getDb();
  const activeId = getActiveAccountId();
  if (activeId) {
    const rec = await db.get("identity", activeId);
    if (rec) return rec;
  }
  // No active pointer (fresh install, or it pointed at a removed account).
  // If exactly one account exists, that's unambiguous — adopt it. Otherwise
  // this is "no identity", which routes to the identity setup screen.
  const all = await db.getAll("identity");
  if (all.length === 1) {
    setActiveAccountId(all[0].id);
    return all[0];
  }
  return null;
}

export async function saveIdentity(record: IdentityRecord): Promise<void> {
  const db = await getDb();
  await db.put("identity", record);
  if (!getActiveAccountId()) setActiveAccountId(record.id);
}

// This account's master pubkey — the identity that signature-authoritative
// personal-axis envelopes (home hub designation, device certs) are keyed by.
// A device that was paired in via QR only holds a subkey seed (its own
// seed_hex can't derive the master), so it must fall back to the
// master_pubkey learned from its cert; every other account can derive it
// directly from its own seed.
export function masterPubkeyOf(rec: IdentityRecord): string {
  if (rec.subkey_cert && rec.master_pubkey) return rec.master_pubkey;
  return masterPublicKeyHex(rec.seed_hex);
}

export async function findAccountByPubkey(pubkey: string): Promise<IdentityRecord | null> {
  const db = await getDb();
  const rec = await db.get("identity", pubkey);
  return rec ?? null;
}

// Used by every "bring an identity onto this device" path (recover phrase,
// sign in with passkey, restore from backup, pair). If that identity is
// already on this device, returns the existing row instead of duplicating it
// — the caller just switches to it.
export async function resolveOrCreateAccount(
  seedHex: string,
  extra?: Partial<Omit<IdentityRecord, "id" | "seed_hex">>,
): Promise<{ account: IdentityRecord; isNew: boolean }> {
  const id = publicKeyHex(seedHex);
  const existing = await findAccountByPubkey(id);
  if (existing) return { account: existing, isNew: false };
  const account: IdentityRecord = {
    id,
    seed_hex: seedHex,
    security_nonce: 0,
    security_level: 0,
    account_order: nextAccountOrder(await listAccounts()),
    ...extra,
  };
  await saveIdentity(account);
  return { account, isNew: true };
}

export async function removeAccount(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("identity", id);
  // Purge the account's namespaced localStorage (prefix must match
  // utils/accountScope.ts accountKey) — leaving it behind would keep live
  // session tokens and DM ratchet state for an identity the user just
  // removed from this device.
  try {
    const prefix = `wavvon:acct:${id}:`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) localStorage.removeItem(key);
    }
  } catch {
    // storage unavailable
  }
  if (getActiveAccountId() === id) {
    const remaining = await listAccounts();
    setActiveAccountId(remaining[0]?.id ?? null);
  }
}

// In-place switch: AccountRoot registers this on mount so switchAccount can
// key-remount <App> instead of reloading the whole page (every piece of
// React state resets by construction on remount — the same teardown
// guarantee a reload gave us, without the white flash). If nothing has
// registered a handler yet (e.g. a call landing before AccountRoot mounts),
// switchAccount falls back to the old reload path as a safety net.
interface InPlaceSwitchArgs {
  id: string;
  returnTo?: "settings-account";
}
type InPlaceSwitchHandler = (args: InPlaceSwitchArgs) => void;
let inPlaceSwitchHandler: InPlaceSwitchHandler | null = null;

export function setInPlaceSwitchHandler(fn: InPlaceSwitchHandler | null): void {
  inPlaceSwitchHandler = fn;
}

// Registered by App: checks live app state (currently: voice) and returns a
// human-readable refusal reason, or null to allow the switch. Defense in
// depth — the UI also disables the Switch button in the same situations, but
// this is the one place every switchAccount call actually goes through.
type SwitchGuard = () => string | null;
let switchGuard: SwitchGuard | null = null;

export function setSwitchGuard(fn: SwitchGuard | null): void {
  switchGuard = fn;
}

// Protects the remount + hub-reconnect window: AccountRoot's key-remount and
// the new account's restorePersistedHubs() need a moment to settle before
// another switch tears it down mid-flight. Chosen to comfortably cover a
// slow hub reconnect without making the device feel locked.
export const SWITCH_COOLDOWN_MS = 4000;
let lastSwitchAt = 0;

export function switchCooldownRemainingMs(now: number = Date.now()): number {
  return Math.max(0, SWITCH_COOLDOWN_MS - (now - lastSwitchAt));
}

// Sentinel returned by switchAccount when the cooldown (and only the
// cooldown) refused the switch — store.ts has no i18n access, so callers map
// this to their own translated message. A guard refusal, by contrast, is
// already a human-readable string (the caller-registered guard produces it).
export const SWITCH_BLOCKED_COOLDOWN = "cooldown";

// Switching accounts swaps the active pointer and hands off to whichever
// switch mechanism is registered (see setInPlaceSwitchHandler above).
//
// returnTo: post-switch destination. Every switch initiated from Settings
// passes "settings-account" so the user lands back where they were —
// managing per-account sections means switching, and bouncing to the main
// view each time made that needlessly tedious.
//
// `now` is only ever overridden by tests (injectable clock for the cooldown
// math); every real call site uses the default.
export function switchAccount(
  id: string,
  returnTo?: "settings-account",
  now: number = Date.now(),
): string | null {
  if (switchCooldownRemainingMs(now) > 0) return SWITCH_BLOCKED_COOLDOWN;
  const guardReason = switchGuard?.();
  if (guardReason) return guardReason;

  lastSwitchAt = now;
  setActiveAccountId(id);
  if (inPlaceSwitchHandler) {
    inPlaceSwitchHandler({ id, returnTo });
    return null;
  }
  try {
    if (returnTo) sessionStorage.setItem("wavvon:post_switch_return", returnTo);
  } catch {
    // storage unavailable — switch still works, just lands on the main view
  }
  window.location.reload();
  return null;
}

// One-shot post-switch destination, consumed exactly once per page load at
// module init. Never read+remove this during a component render: React
// StrictMode double-invokes render bodies, so a render-time consumer races
// itself — the first invocation eats the flag and the second sees nothing,
// which intermittently dropped the user on the home view after switching.
const postSwitchReturnValue: string | null = (() => {
  try {
    const v = sessionStorage.getItem("wavvon:post_switch_return");
    if (v) sessionStorage.removeItem("wavvon:post_switch_return");
    return v;
  } catch {
    return null;
  }
})();

export function getPostSwitchReturn(): string | null {
  return postSwitchReturnValue;
}

export async function generateIdentity(): Promise<IdentityRecord> {
  const seed = ed25519.utils.randomPrivateKey();
  const { account } = await resolveOrCreateAccount(bytesToHex(seed));
  return account;
}

// A fresh random 32-byte ed25519 seed (hex), not persisted. Used to mint a new
// device's subkey during pairing.
export function generateSubkeySeed(): string {
  return bytesToHex(ed25519.utils.randomPrivateKey());
}

export { bytesToHex, hexToBytes } from "@wavvon/core";
