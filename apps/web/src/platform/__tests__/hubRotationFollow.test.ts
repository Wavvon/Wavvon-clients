import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadSavedHubs,
  saveSavedHubs,
  rekeySavedHub,
  saveToken,
  loadToken,
  saveActiveHubId,
  loadActiveHubId,
  type SavedHub,
} from "../storage";

// No DOM environment in this workspace (same shim as capabilities.test.ts):
// storage.ts reads both localStorage and sessionStorage.
function memoryStorage() {
  const data: Record<string, string> = {};
  return {
    data,
    api: {
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
      removeItem: (k: string) => {
        delete data[k];
      },
      clear: () => {
        for (const k of Object.keys(data)) delete data[k];
      },
    },
  };
}
const localMem = memoryStorage();
const sessionMem = memoryStorage();
vi.stubGlobal("localStorage", localMem.api);
vi.stubGlobal("sessionStorage", sessionMem.api);

const OLD = "e07fcf4499e0942ff898c44b8d5ef69b8457b9ae95710480982fd3b36e56273b";
const NEW = "b424187b0a928c90b1803b7200ed679ae1d8cfd90b86f21c21ab40e6bf3fbc13";

const hub = (id: string): SavedHub => ({
  hub_id: id,
  hub_name: "Example Hub",
  hub_url: "https://hub.example",
  hub_icon: null,
  remember_token: true,
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("rekeySavedHub", () => {
  it("moves the entry, the remembered token and the active pointer together", () => {
    saveSavedHubs([hub(OLD)]);
    saveToken(OLD, "tok-abc", true);
    saveActiveHubId(OLD);

    expect(rekeySavedHub(OLD, NEW)).toBe(true);

    const list = loadSavedHubs();
    expect(list).toHaveLength(1);
    expect(list[0].hub_id).toBe(NEW);
    expect(list[0].hub_name).toBe("Example Hub");
    // The token is a bearer token: still valid, just filed under the new name.
    expect(loadToken(NEW)).toBe("tok-abc");
    expect(loadToken(OLD)).toBeNull();
    expect(loadActiveHubId()).toBe(NEW);
  });

  it("moves a session-only token too", () => {
    saveSavedHubs([hub(OLD)]);
    saveToken(OLD, "tok-session", false);

    expect(rekeySavedHub(OLD, NEW)).toBe(true);
    expect(loadToken(NEW)).toBe("tok-session");
    expect(loadToken(OLD)).toBeNull();
  });

  it("leaves an untouched hub alone when the old id is not held", () => {
    saveSavedHubs([hub("cafe")]);
    expect(rekeySavedHub(OLD, NEW)).toBe(false);
    expect(loadSavedHubs()[0].hub_id).toBe("cafe");
  });

  it("refuses to collapse two hubs into one", () => {
    saveSavedHubs([hub(OLD), hub(NEW)]);
    expect(rekeySavedHub(OLD, NEW)).toBe(false);
    expect(loadSavedHubs().map((h) => h.hub_id)).toEqual([OLD, NEW]);
  });

  it("does not touch the active pointer when it names another hub", () => {
    saveSavedHubs([hub(OLD), hub("cafe")]);
    saveActiveHubId("cafe");
    expect(rekeySavedHub(OLD, NEW)).toBe(true);
    expect(loadActiveHubId()).toBe("cafe");
  });
});
