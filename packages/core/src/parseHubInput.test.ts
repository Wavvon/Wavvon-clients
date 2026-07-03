import { describe, it, expect } from "vitest";
import { parseHubInput } from "./parseHubInput";

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
