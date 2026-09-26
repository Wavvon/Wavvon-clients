import { describe, it, expect, afterEach } from "vitest";
import { passkeysUsableWith } from "../webauthn";

// A passkey's rp_id is the hub's hostname, and a browser refuses an rp_id its
// own page is not registrable under — so the answer turns on the page's
// origin, not on the browser. There is no jsdom in this workspace, and this
// needs two properties of one global, so it stubs them.
function pageOn(hostname: string, webauthn = true) {
  (globalThis as { window?: unknown }).window = {
    location: { hostname },
    ...(webauthn ? { PublicKeyCredential: class {} } : {}),
  };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("passkeysUsableWith", () => {
  it("accepts the hub that served the page", () => {
    pageOn("chat.example");
    expect(passkeysUsableWith("https://chat.example")).toBe(true);
    expect(passkeysUsableWith("chat.example:3000")).toBe(true);
  });

  it("accepts a page under the hub's domain", () => {
    pageOn("app.chat.example");
    expect(passkeysUsableWith("https://chat.example")).toBe(true);
  });

  it("refuses a hub on another host — the user build's whole situation", () => {
    pageOn("app.wavvon.example");
    expect(passkeysUsableWith("https://chat.example")).toBe(false);
    // Not a suffix match on the raw string: a lookalike host is a different host.
    expect(passkeysUsableWith("https://notchat.example")).toBe(false);
  });

  it("refuses nothing at all rather than throwing", () => {
    pageOn("chat.example");
    expect(passkeysUsableWith(undefined)).toBe(false);
    expect(passkeysUsableWith("")).toBe(false);
    expect(passkeysUsableWith("http://")).toBe(false);
  });

  it("says no when the browser has no WebAuthn, same host or not", () => {
    pageOn("chat.example", false);
    expect(passkeysUsableWith("https://chat.example")).toBe(false);
  });
});
