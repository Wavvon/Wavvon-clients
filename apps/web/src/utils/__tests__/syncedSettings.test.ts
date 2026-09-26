import { describe, it, expect, beforeEach, vi } from "vitest";
import { collectSyncedSettings, applySyncedSettings, SYNCED_KEYS } from "../syncedSettings";
import { setActiveAccountId } from "../../identity/store";

const store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
});

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  setActiveAccountId("acct-1");
});

describe("collectSyncedSettings", () => {
  it("omits keys that were never set, so no-opinion never overwrites a choice", () => {
    expect(collectSyncedSettings()).toEqual({});
  });

  it("reads scoped and unscoped keys from their real homes", () => {
    localStorage.setItem("wavvon_language", "it");
    localStorage.setItem("wavvon:acct:acct-1:wavvon.mentionPing", "0");
    expect(collectSyncedSettings()).toEqual({
      "wavvon_language": "it",
      "wavvon.mentionPing": "0",
    });
  });

  it("does not carry device-bound settings", () => {
    localStorage.setItem("wavvon.audioInputDevice", "mic-abc");
    localStorage.setItem("wavvon:acct:acct-1:wavvon.drafts", "{}");
    expect(collectSyncedSettings()).toEqual({});
    expect(SYNCED_KEYS.map((k) => k.key)).not.toContain("wavvon.audioInputDevice");
    expect(SYNCED_KEYS.map((k) => k.key)).not.toContain("wavvon.drafts");
  });
});

describe("applySyncedSettings", () => {
  it("writes scoped keys under the active account and unscoped ones bare", () => {
    applySyncedSettings({ "wavvon_language": "de", "wavvon.voiceSounds": "0" });
    expect(store["wavvon_language"]).toBe("de");
    expect(store["wavvon:acct:acct-1:wavvon.voiceSounds"]).toBe("0");
  });

  it("reports a change only when a value actually differs", () => {
    expect(applySyncedSettings({ "wavvon_language": "es" })).toBe(true);
    expect(applySyncedSettings({ "wavvon_language": "es" })).toBe(false);
  });

  it("merges rather than clears: absent keys are left alone", () => {
    localStorage.setItem("wavvon_language", "it");
    applySyncedSettings({ "wavvon.voiceSounds": "0" });
    expect(store["wavvon_language"]).toBe("it");
  });

  it("ignores keys outside the allowlist", () => {
    applySyncedSettings({ "wavvon.audioInputDevice": "mic-from-another-machine" });
    expect(store["wavvon.audioInputDevice"]).toBeUndefined();
  });

  it("round-trips a full snapshot", () => {
    localStorage.setItem("wavvon:appearance", '{"slot":"midnight","skin":null}');
    localStorage.setItem("wavvon:acct:acct-1:wavvon.hideBirthdays", "true");
    const snapshot = collectSyncedSettings();
    for (const k of Object.keys(store)) delete store[k];
    expect(applySyncedSettings(snapshot)).toBe(true);
    expect(collectSyncedSettings()).toEqual(snapshot);
  });
});
