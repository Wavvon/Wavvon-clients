import { describe, it, expect } from "vitest";
import { parseHubInput, buildInviteLink, inviteCodeFromPath } from "./parseHubInput";

describe("parseHubInput — invite links carrying a hub serial", () => {
  it("parses wavvon://host/i/<serial>/<code> into hubUrl + serial + code", () => {
    const r = parseHubInput("wavvon://host.example.com/i/abc123serial/joincode99");
    expect(r).toEqual({
      hubUrl: "https://host.example.com",
      inviteCode: "joincode99",
      hubSerial: "abc123serial",
    });
  });

  it("parses the https form and the ?hub= serial param", () => {
    expect(parseHubInput("https://host.example.com/i/hub7/code7")).toEqual({
      hubUrl: "https://host.example.com",
      inviteCode: "code7",
      hubSerial: "hub7",
    });
    expect(parseHubInput("https://host.example.com?hub=hub7&invite=code7")).toEqual({
      hubUrl: "https://host.example.com",
      inviteCode: "code7",
      hubSerial: "hub7",
    });
  });

  it("localhost invite links stay on http", () => {
    const r = parseHubInput("wavvon://localhost:3000/i/serialX/codeX");
    expect(r?.hubUrl).toBe("http://localhost:3000");
    expect(r?.hubSerial).toBe("serialX");
    expect(r?.inviteCode).toBe("codeX");
  });

  it("buildInviteLink emits the plain /join form and round-trips through parseHubInput", () => {
    const link = buildInviteLink("https://host.example.com", "welcome");
    expect(link).toBe("https://host.example.com/join/welcome");
    const r = parseHubInput(link);
    expect(r?.hubUrl).toBe("https://host.example.com");
    expect(r?.inviteCode).toBe("welcome");
  });

  it("buildInviteLink uses http for localhost hubs", () => {
    const link = buildInviteLink("http://localhost:3000", "247ba780be0b");
    expect(link).toBe("http://localhost:3000/join/247ba780be0b");
    const r = parseHubInput(link);
    expect(r?.hubUrl).toBe("http://localhost:3000");
    expect(r?.inviteCode).toBe("247ba780be0b");
  });

  it("legacy wavvon://host/code links keep working (no serial)", () => {
    const r = parseHubInput("wavvon://hub.example.com/legacycode");
    expect(r?.hubUrl).toBe("https://hub.example.com");
    expect(r?.inviteCode).toBe("legacycode");
    expect(r?.hubSerial).toBeUndefined();
  });

  it("parses the browser-facing https://host/join/<code> form the hub prints", () => {
    // The first-boot owner invite log line advertises exactly this shape —
    // pasting it into Add-hub must carry the code (found live 2026-07-06:
    // the code was dropped and the join 403'd with 'requires an invite code').
    expect(parseHubInput("https://hub.example.com/join/a9bfb3169454")).toEqual({
      hubUrl: "https://hub.example.com",
      inviteCode: "a9bfb3169454",
    });
    const r = parseHubInput("wavvon://hub.example.com/join/codeY");
    expect(r?.hubUrl).toBe("https://hub.example.com");
    expect(r?.inviteCode).toBe("codeY");
    expect(r?.hubSerial).toBeUndefined();
  });
});

describe("parseHubInput — deep link targets (nested-channels-ux.md §1.3)", () => {
  it("parses a channel permalink", () => {
    const result = parseHubInput("wavvon://hub.example.com/channel/abc123");
    expect(result).toEqual({
      hubUrl: "https://hub.example.com",
      inviteCode: "",
      target: { kind: "channel", channelId: "abc123" },
    });
  });

  it("parses a message permalink", () => {
    const result = parseHubInput("wavvon://hub.example.com/channel/abc123/message/xyz789");
    expect(result).toEqual({
      hubUrl: "https://hub.example.com",
      inviteCode: "",
      target: { kind: "message", channelId: "abc123", messageId: "xyz789" },
    });
  });

  it("keeps a query string off the parsed target", () => {
    const result = parseHubInput("wavvon://hub.example.com/channel/abc123?ref=share");
    expect(result?.target).toEqual({ kind: "channel", channelId: "abc123" });
  });

  it("resolves localhost to http for a channel permalink", () => {
    const result = parseHubInput("wavvon://localhost:3000/channel/abc123");
    expect(result?.hubUrl).toBe("http://localhost:3000");
    expect(result?.target).toEqual({ kind: "channel", channelId: "abc123" });
  });

  it("falls back to invite-code parsing for a plain invite link", () => {
    const result = parseHubInput("wavvon://hub.example.com/some-invite-code");
    expect(result).toEqual({
      hubUrl: "https://hub.example.com",
      inviteCode: "some-invite-code",
    });
  });

  it("treats garbage paths as an invite code, not a target", () => {
    const result = parseHubInput("wavvon://hub.example.com/channel");
    expect(result?.target).toBeUndefined();
    expect(result?.inviteCode).toBe("channel");
  });

  it("treats an unrecognised path shape as an invite code", () => {
    const result = parseHubInput("wavvon://hub.example.com/channel/abc123/nonsense");
    expect(result?.target).toBeUndefined();
    expect(result?.inviteCode).toBe("channel/abc123/nonsense");
  });

  it("treats a message path missing the message id as an invite code", () => {
    const result = parseHubInput("wavvon://hub.example.com/channel/abc123/message");
    expect(result?.target).toBeUndefined();
    expect(result?.inviteCode).toBe("channel/abc123/message");
  });

  it("existing callers reading only hubUrl/inviteCode are unaffected", () => {
    const result = parseHubInput("wavvon://hub.example.com/invite-xyz");
    expect(result?.hubUrl).toBe("https://hub.example.com");
    expect(result?.inviteCode).toBe("invite-xyz");
  });

  it("plain hostnames still resolve with no target", () => {
    const result = parseHubInput("hub.example.com");
    expect(result).toEqual({ hubUrl: "https://hub.example.com", inviteCode: "" });
  });

  it("https URLs with an invite query param still resolve with no target", () => {
    const result = parseHubInput("https://hub.example.com?invite=abc");
    expect(result).toEqual({ hubUrl: "https://hub.example.com", inviteCode: "abc" });
  });

  it("returns null for empty input", () => {
    expect(parseHubInput("   ")).toBeNull();
  });
});

describe("parseHubInput — LAN fingerprint pinning (lan-mode.md §5)", () => {
  const fp = "a".repeat(64);

  it("extracts a fingerprint from the ?fp= query param", () => {
    const result = parseHubInput(`https://192.168.1.50:3000?fp=${fp}`);
    expect(result?.fingerprint).toBe(fp);
  });

  it("extracts a fingerprint from the #fp= hash fragment, case-insensitively", () => {
    const result = parseHubInput(`https://192.168.1.50:3000#fp=${fp.toUpperCase()}`);
    expect(result?.fingerprint).toBe(fp);
  });

  it("is absent when no fp is given", () => {
    const result = parseHubInput("https://hub.example.com?invite=abc");
    expect(result?.fingerprint).toBeUndefined();
  });

  it("ignores a malformed fingerprint (wrong length / non-hex)", () => {
    expect(parseHubInput("https://hub.example.com?fp=abc123")?.fingerprint).toBeUndefined();
    expect(
      parseHubInput(`https://hub.example.com?fp=${"z".repeat(64)}`)?.fingerprint,
    ).toBeUndefined();
  });
});

describe("buildInviteLink on a path-hosted hub", () => {
  // The hub's address already carries its slug (from /info.canonical_url), so
  // appending /join/<code> is the whole job — no separate serial argument, and
  // no way for the two to disagree.
  it("keeps the /hub/<slug> path so the link reaches the right hub", () => {
    const link = buildInviteLink("https://host.example.com/hub/mangiadapippo", "code9");
    expect(link).toBe("https://host.example.com/hub/mangiadapippo/join/code9");

    const parsed = parseHubInput(link);
    expect(parsed?.hubUrl).toBe("https://host.example.com/hub/mangiadapippo");
    expect(parsed?.inviteCode).toBe("code9");
  });
});

describe("parseHubInput — path-hosted hub base URLs", () => {
  // The bug this covers: without splitting the /hub/<slug> prefix out of the
  // path, such an invite link parsed to the host's root with no invite code —
  // so pasting it into Add-hub reached nothing, or the wrong hub.
  it("keeps the hub prefix in hubUrl and still finds the invite code", () => {
    expect(parseHubInput("https://host.example.com/hub/pippo/join/abc123")).toEqual({
      hubUrl: "https://host.example.com/hub/pippo",
      inviteCode: "abc123",
    });
  });

  it("keeps the prefix for a bare hub address with no invite", () => {
    expect(parseHubInput("https://host.example.com/hub/pippo")).toEqual({
      hubUrl: "https://host.example.com/hub/pippo",
      inviteCode: "",
    });
  });

  it("carries a ?invite= query alongside the prefix", () => {
    expect(parseHubInput("https://host.example.com/hub/pippo?invite=xyz")).toEqual({
      hubUrl: "https://host.example.com/hub/pippo",
      inviteCode: "xyz",
    });
  });

  // A standalone hub has no prefix, and must be untouched by any of this.
  it("leaves a hub that owns its whole origin exactly as before", () => {
    expect(parseHubInput("https://hub.example.com/join/abc123")).toEqual({
      hubUrl: "https://hub.example.com",
      inviteCode: "abc123",
    });
  });

  // The wavvon:// branch had the host-only bug the http(s) branch was fixed
  // for, which meant the client could not read the permalinks it writes: on a
  // farm-hosted hub, "Copy channel link" produces
  // wavvon://host/hub/<pubkey>/channel/<id>, and pasting it back reached the
  // farm root with the whole prefix sitting in the invite code. Caught by
  // driving the real client against a farm-hosted hub.
  it("splits the prefix out of a wavvon:// channel permalink", () => {
    expect(parseHubInput("wavvon://host.example.com/hub/pippo/channel/abc123")).toEqual({
      hubUrl: "https://host.example.com/hub/pippo",
      inviteCode: "",
      target: { kind: "channel", channelId: "abc123" },
    });
  });

  it("splits the prefix out of a wavvon:// message permalink", () => {
    expect(
      parseHubInput("wavvon://host.example.com/hub/pippo/channel/abc123/message/xyz789"),
    ).toEqual({
      hubUrl: "https://host.example.com/hub/pippo",
      inviteCode: "",
      target: { kind: "message", channelId: "abc123", messageId: "xyz789" },
    });
  });

  it("splits the prefix out of a wavvon:// join link", () => {
    expect(parseHubInput("wavvon://host.example.com/hub/pippo/join/abc123")).toEqual({
      hubUrl: "https://host.example.com/hub/pippo",
      inviteCode: "abc123",
    });
  });

  it("leaves a wavvon:// link to a hub that owns its origin alone", () => {
    expect(parseHubInput("wavvon://hub.example.com/abc123")).toEqual({
      hubUrl: "https://hub.example.com",
      inviteCode: "abc123",
    });
  });
});

describe("inviteCodeFromPath", () => {
  it("reads the code out of a /join/<code> path", () => {
    expect(inviteCodeFromPath("/join/d00a375964f4")).toBe("d00a375964f4");
  });

  it("tolerates a trailing slash", () => {
    expect(inviteCodeFromPath("/join/abc123/")).toBe("abc123");
  });

  it("returns null for a normal page load", () => {
    expect(inviteCodeFromPath("/")).toBeNull();
    expect(inviteCodeFromPath("")).toBeNull();
  });

  it("returns null for paths that merely start with join", () => {
    expect(inviteCodeFromPath("/joinsomething/abc")).toBeNull();
    expect(inviteCodeFromPath("/join")).toBeNull();
    expect(inviteCodeFromPath("/join/")).toBeNull();
  });

  it("refuses a code with path separators or junk, rather than passing it on", () => {
    expect(inviteCodeFromPath("/join/a/b")).toBeNull();
    expect(inviteCodeFromPath("/join/../etc")).toBeNull();
    expect(inviteCodeFromPath("/join/abc?x=1")).toBeNull();
  });

  it("round-trips a link built by buildInviteLink", () => {
    const link = buildInviteLink("hub.example", "zz99");
    expect(inviteCodeFromPath(new URL(link).pathname)).toBe("zz99");
  });
});
