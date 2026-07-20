import { describe, it, expect, afterEach } from "vitest";
import {
  switchAccount,
  setSwitchGuard,
  setInPlaceSwitchHandler,
  switchCooldownRemainingMs,
  SWITCH_BLOCKED_COOLDOWN,
  SWITCH_COOLDOWN_MS,
} from "../store";

// All timestamps below are explicit (the injectable `now` param), never
// Date.now() — no real sleeps, no flakiness. Tests run in one file against
// shared module state (lastSwitchAt, the registered guard/handler), so each
// uses a `now` far enough past the previous test's switch to stand on its
// own except where the cooldown itself is what's under test.

afterEach(() => {
  setSwitchGuard(null);
  setInPlaceSwitchHandler(null);
});

describe("switchAccount guard", () => {
  it("refuses with the guard's own reason, and does not start the cooldown", () => {
    setSwitchGuard(() => "in voice");
    const far = 10_000_000;
    expect(switchAccount("acct-a", undefined, far)).toBe("in voice");

    // The refusal must not have consumed the cooldown window — with the
    // guard cleared, the exact same `now` succeeds.
    setSwitchGuard(null);
    let handled: unknown = null;
    setInPlaceSwitchHandler((args) => { handled = args; });
    expect(switchAccount("acct-a", undefined, far)).toBeNull();
    expect(handled).toEqual({ id: "acct-a", returnTo: undefined });
  });

  it("allows the switch once unregistered", () => {
    setSwitchGuard(() => "blocked");
    setSwitchGuard(null);
    let handled: unknown = null;
    setInPlaceSwitchHandler((args) => { handled = args; });
    const far = 20_000_000;
    expect(switchAccount("acct-b", "settings-account", far)).toBeNull();
    expect(handled).toEqual({ id: "acct-b", returnTo: "settings-account" });
  });
});

describe("switchAccount cooldown", () => {
  it("refuses a second switch shortly after the first, then allows it once the window passes", () => {
    const calls: unknown[] = [];
    setInPlaceSwitchHandler((args) => { calls.push(args); });

    const base = 30_000_000;
    expect(switchAccount("acct-c", undefined, base)).toBeNull();
    expect(calls).toHaveLength(1);

    // Well inside the cooldown window.
    expect(switchCooldownRemainingMs(base + 1000)).toBe(SWITCH_COOLDOWN_MS - 1000);
    expect(switchAccount("acct-d", undefined, base + 1000)).toBe(SWITCH_BLOCKED_COOLDOWN);
    expect(calls).toHaveLength(1); // refused switch never reaches the handler

    // Exactly at the boundary the window has fully elapsed.
    expect(switchCooldownRemainingMs(base + SWITCH_COOLDOWN_MS)).toBe(0);
    expect(switchAccount("acct-e", undefined, base + SWITCH_COOLDOWN_MS)).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it("takes priority over a guard refusal while active", () => {
    setInPlaceSwitchHandler(() => {});
    const base = 40_000_000;
    expect(switchAccount("acct-f", undefined, base)).toBeNull();

    setSwitchGuard(() => "in voice");
    // Still within the cooldown: the cooldown sentinel wins over the guard's
    // message — a refused switch during cooldown is a timing artifact, not
    // a voice-state fact worth surfacing.
    expect(switchAccount("acct-g", undefined, base + 500)).toBe(SWITCH_BLOCKED_COOLDOWN);
  });
});
