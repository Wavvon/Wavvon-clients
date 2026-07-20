import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import {
  switchAccountGuarded,
  setSwitchGuard,
  SWITCH_BLOCKED_COOLDOWN,
} from "./store";

describe("switchAccountGuarded", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    setSwitchGuard(null);
  });

  it("refuses without calling invoke while the voice guard is set", async () => {
    setSwitchGuard(() => "joined to a voice channel");
    // Past the initial cooldown window (which starts counted from t=0) so
    // this exercises the guard, not the cooldown.
    const result = await switchAccountGuarded("acct-1", 5_000);
    expect(result).toBe("joined to a voice channel");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("refuses within the cooldown window after a successful switch", async () => {
    invokeMock.mockResolvedValue({ id: "acct-1", label: null, order: 1, is_active: true, kind: "owned" });
    const first = await switchAccountGuarded("acct-1", 10_000);
    expect(first).toBeNull();
    expect(invokeMock).toHaveBeenCalledTimes(1);

    const second = await switchAccountGuarded("acct-2", 10_500); // 500ms later, well inside 4s
    expect(second).toBe(SWITCH_BLOCKED_COOLDOWN);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("allows a switch again once the cooldown has elapsed", async () => {
    invokeMock.mockResolvedValue({ id: "acct-1", label: null, order: 1, is_active: true, kind: "owned" });
    await switchAccountGuarded("acct-1", 20_000);
    const later = await switchAccountGuarded("acct-2", 24_001); // just past 4000ms
    expect(later).toBeNull();
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});
