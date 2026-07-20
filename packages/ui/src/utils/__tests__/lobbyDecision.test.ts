import { describe, it, expect } from "vitest";
import {
  resolveSessionScope,
  decideLobbyView,
  applyPowSubmitResult,
  computeLobbyProgress,
} from "../lobbyDecision";

describe("resolveSessionScope", () => {
  it("recognizes an explicit lobby scope", () => {
    expect(resolveSessionScope("lobby")).toBe("lobby");
  });

  it("treats an explicit member scope as member", () => {
    expect(resolveSessionScope("member")).toBe("member");
  });

  it("defaults to member when the field is absent (hub predates the lobby feature)", () => {
    expect(resolveSessionScope(undefined)).toBe("member");
    expect(resolveSessionScope(null)).toBe("member");
  });

  it("defaults to member for any unrecognized value", () => {
    expect(resolveSessionScope("bot")).toBe("member");
    expect(resolveSessionScope("")).toBe("member");
  });
});

describe("decideLobbyView", () => {
  it("promotes when the hub already reports member status", () => {
    expect(decideLobbyView({ status: "member", required_level: 10, current_level: 3 })).toBe("promoted");
  });

  it("stays active while still below the required level", () => {
    expect(decideLobbyView({ status: "lobby", required_level: 10, current_level: 3 })).toBe("active");
  });

  it("promotes when PoW was already satisfied before this session (no lobby needed)", () => {
    expect(decideLobbyView({ status: "lobby", required_level: 10, current_level: 10 })).toBe("promoted");
    expect(decideLobbyView({ status: "lobby", required_level: 10, current_level: 12 })).toBe("promoted");
  });

  it("promotes immediately when the hub has no security gate at all", () => {
    expect(decideLobbyView({ status: "lobby", required_level: 0, current_level: 0 })).toBe("promoted");
  });
});

describe("applyPowSubmitResult", () => {
  it("adopts the new level and promoted flag on a normal response", () => {
    expect(applyPowSubmitResult(3, { promoted: false, new_level: 5 })).toEqual({ level: 5, promoted: false });
  });

  it("reports promotion once the hub confirms it", () => {
    expect(applyPowSubmitResult(9, { promoted: true, new_level: 10 })).toEqual({ level: 10, promoted: true });
  });

  it("never regresses the level for a stale out-of-order response", () => {
    expect(applyPowSubmitResult(8, { promoted: false, new_level: 4 })).toEqual({ level: 8, promoted: false });
  });
});

describe("computeLobbyProgress", () => {
  it("reports full progress and zero ETA when there is no gate", () => {
    expect(computeLobbyProgress(0, 0)).toEqual({ pct: 100, etaMinutes: 0 });
  });

  it("computes partial progress and a proportional ETA", () => {
    expect(computeLobbyProgress(5, 10)).toEqual({ pct: 50, etaMinutes: 10 });
  });

  it("clamps progress at 100% once the target is met or exceeded", () => {
    expect(computeLobbyProgress(10, 10)).toEqual({ pct: 100, etaMinutes: 0 });
    expect(computeLobbyProgress(15, 10)).toEqual({ pct: 100, etaMinutes: 0 });
  });

  it("never reports a negative ETA", () => {
    expect(computeLobbyProgress(20, 10).etaMinutes).toBe(0);
  });
});
