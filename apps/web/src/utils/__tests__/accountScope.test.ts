import { describe, it, expect, beforeEach, vi } from "vitest";
import { accountKey, getScoped, setScoped, removeScoped } from "../accountScope";
import { setActiveAccountId } from "../../identity/store";

const localStorageData: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => localStorageData[k] ?? null,
  setItem: (k: string, v: string) => {
    localStorageData[k] = v;
  },
  removeItem: (k: string) => {
    delete localStorageData[k];
  },
});

beforeEach(() => {
  for (const k of Object.keys(localStorageData)) delete localStorageData[k];
});

describe("accountKey", () => {
  it("namespaces under the explicitly passed account id", () => {
    expect(accountKey("wavvon.drafts", "acct-1")).toBe("wavvon:acct:acct-1:wavvon.drafts");
  });

  it("namespaces under the active account when none is passed", () => {
    setActiveAccountId("acct-2");
    expect(accountKey("wavvon.drafts")).toBe("wavvon:acct:acct-2:wavvon.drafts");
  });

  it("falls back to the bare key when there is no active account", () => {
    setActiveAccountId(null);
    expect(accountKey("wavvon.drafts")).toBe("wavvon.drafts");
  });

  it("keeps different accounts' namespaces distinct", () => {
    expect(accountKey("wavvon.drafts", "acct-a")).not.toBe(accountKey("wavvon.drafts", "acct-b"));
  });
});

describe("getScoped / setScoped / removeScoped", () => {
  it("round-trips a value under the active account", () => {
    setActiveAccountId("acct-3");
    setScoped("wavvon.drafts", "hello");
    expect(getScoped("wavvon.drafts")).toBe("hello");
    expect(localStorageData["wavvon:acct:acct-3:wavvon.drafts"]).toBe("hello");
  });

  it("isolates the same key across two different active accounts", () => {
    setActiveAccountId("acct-a");
    setScoped("wavvon.drafts", "from-a");
    setActiveAccountId("acct-b");
    setScoped("wavvon.drafts", "from-b");

    setActiveAccountId("acct-a");
    expect(getScoped("wavvon.drafts")).toBe("from-a");
    setActiveAccountId("acct-b");
    expect(getScoped("wavvon.drafts")).toBe("from-b");
  });

  it("removes only the scoped key", () => {
    setActiveAccountId("acct-4");
    setScoped("wavvon.drafts", "hello");
    removeScoped("wavvon.drafts");
    expect(getScoped("wavvon.drafts")).toBeNull();
  });
});
