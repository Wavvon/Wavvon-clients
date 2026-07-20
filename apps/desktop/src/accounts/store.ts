// Desktop's account-switch plumbing — the analogue of web's
// apps/web/src/identity/store.ts, but thinner: the Rust side
// (src-tauri/src/accounts.rs) owns the registry, active pointer, and
// per-account file namespacing, so this module is just invoke() wrappers
// plus the same in-place-remount / switch-guard / cooldown contract web's
// AccountRoot + App use (decisions.md "Account switching is an in-place
// key-remount, guarded, not a reload").
//
// Device-local only, same as web: this never talks to a hub.

import { invoke } from "@tauri-apps/api/core";

export interface AccountSummary {
  id: string;
  label: string | null;
  order: number;
  is_active: boolean;
  /** "owned" (has its own identity.json), "paired" (claimed via QR pairing,
   * no master seed on this device), or "empty" (registered but not yet
   * populated — shouldn't normally be observed by the UI). */
  kind: "owned" | "paired" | "empty";
}

export function listAccounts(): Promise<AccountSummary[]> {
  return invoke<AccountSummary[]>("list_accounts");
}

export function createAccount(opts: { label?: string; phrase?: string } = {}): Promise<AccountSummary> {
  return invoke<AccountSummary>("create_account", {
    label: opts.label ?? null,
    phrase: opts.phrase ?? null,
  });
}

export async function removeAccount(id: string): Promise<void> {
  await invoke("remove_account", { id });
}

export function renameAccount(id: string, label: string): Promise<AccountSummary> {
  return invoke<AccountSummary>("rename_account", { id, label });
}

export function reorderAccounts(idsInOrder: string[]): Promise<AccountSummary[]> {
  return invoke<AccountSummary[]>("reorder_accounts", { idsInOrder });
}

// --- In-place switch plumbing (mirrors web's identity/store.ts) -----------

interface InPlaceSwitchArgs {
  id: string;
}
type InPlaceSwitchHandler = (args: InPlaceSwitchArgs) => void;
let inPlaceSwitchHandler: InPlaceSwitchHandler | null = null;

/** Registered by AccountRoot on mount so switchAccountGuarded can key-remount
 * <App> instead of anything more disruptive. */
export function setInPlaceSwitchHandler(fn: InPlaceSwitchHandler | null): void {
  inPlaceSwitchHandler = fn;
}

/** Registered by App: checks live app state (currently: voice) and returns a
 * human-readable refusal reason, or null to allow the switch. */
type SwitchGuard = () => string | null;
let switchGuard: SwitchGuard | null = null;

export function setSwitchGuard(fn: SwitchGuard | null): void {
  switchGuard = fn;
}

/** Protects the remount + per-account reconnect window, same value as web. */
export const SWITCH_COOLDOWN_MS = 4000;
let lastSwitchAt = 0;

export function switchCooldownRemainingMs(now: number = Date.now()): number {
  return Math.max(0, SWITCH_COOLDOWN_MS - (now - lastSwitchAt));
}

/** Sentinel returned when the cooldown (and only the cooldown) refused the
 * switch, so callers can show their own translated message. */
export const SWITCH_BLOCKED_COOLDOWN = "cooldown";

// Switches accounts: guarded by the voice-join guard and the post-switch
// cooldown, same contract as web's switchAccount(). Unlike web (a
// synchronous localStorage pointer flip), the active pointer lives in the
// Rust-side registry and flipping it also tears down live hub sessions
// there, so this awaits switch_account before handing off to the in-place
// remount handler AccountRoot registered.
export async function switchAccountGuarded(id: string, now: number = Date.now()): Promise<string | null> {
  if (switchCooldownRemainingMs(now) > 0) return SWITCH_BLOCKED_COOLDOWN;
  const guardReason = switchGuard?.();
  if (guardReason) return guardReason;

  const summary = await invoke<AccountSummary>("switch_account", { id });
  lastSwitchAt = now;
  inPlaceSwitchHandler?.({ id: summary.id });
  return null;
}
