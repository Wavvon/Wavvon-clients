import { describe, it, expect } from "vitest";
import { parseHubInput, buildInviteLink } from "./parseHubInput";

describe("parseHubInput — farm-ready invite links (hub serial)", () => {
  it("parses wavvon://host/i/<serial>/<code> into hubUrl + serial + code", () => {
    const r = parseHubInput("wavvon://farm.example.com/i/abc123serial/joincode99");
    expect(r).toEqual({
      hubUrl: "https://farm.example.com",
      inviteCode: "joincode99",
      hubSerial: "abc123serial",
    });
  });

  it("parses the https form and the ?hub= serial param", () => {
    expect(parseHubInput("https://farm.example.com/i/hub7/code7")).toEqual({
      hubUrl: "https://farm.example.com",
      inviteCode: "code7",
      hubSerial: "hub7",
    });
    expect(parseHubInput("https://farm.example.com?hub=hub7&invite=code7")).toEqual({
      hubUrl: "https://farm.example.com",
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

  it("buildInviteLink round-trips through parseHubInput", () => {
    const link = buildInviteLink("https://farm.example.com", "serial42", "welcome");
    expect(link).toBe("wavvon://farm.example.com/i/serial42/welcome");
    const r = parseHubInput(link);
    expect(r?.hubUrl).toBe("https://farm.example.com");
    expect(r?.hubSerial).toBe("serial42");
    expect(r?.inviteCode).toBe("welcome");
  });

  it("legacy wavvon://host/code links keep working (no serial)", () => {
    const r = parseHubInput("wavvon://hub.example.com/legacycode");
    expect(r?.hubUrl).toBe("https://hub.example.com");
    expect(r?.inviteCode).toBe("legacycode");
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
