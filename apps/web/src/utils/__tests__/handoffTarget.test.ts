import { describe, it, expect } from "vitest";
import { parseHubInput } from "@wavvon/core";
import { handoffTargetUrl } from "../handoffTarget";

// The point of these is the round trip, not the string shape: the hub build
// hands over a hub and a code, and the add-hub flow must get exactly those
// two back out. Asserted against the real parser so a change on either side
// fails here instead of quietly dropping an invite code.
describe("handoffTargetUrl", () => {
  it("round-trips hub and code through parseHubInput", () => {
    const parsed = parseHubInput(handoffTargetUrl("https://hub.example", "ABC123"));
    expect(parsed?.hubUrl).toBe("https://hub.example");
    expect(parsed?.inviteCode).toBe("ABC123");
  });

  it("round-trips when the sender's origin carries a trailing slash", () => {
    const parsed = parseHubInput(handoffTargetUrl("https://hub.example/", "ABC123"));
    expect(parsed?.hubUrl).toBe("https://hub.example");
    expect(parsed?.inviteCode).toBe("ABC123");
  });

  it("keeps a port, which a self-hosted hub usually has", () => {
    const parsed = parseHubInput(handoffTargetUrl("https://hub.example:8443", "XYZ"));
    expect(parsed?.hubUrl).toBe("https://hub.example:8443");
    expect(parsed?.inviteCode).toBe("XYZ");
  });

  it("is just the hub when there is no invite code — an open hub needs none", () => {
    expect(handoffTargetUrl("https://hub.example/", "")).toBe("https://hub.example");
    expect(parseHubInput(handoffTargetUrl("https://hub.example", ""))?.hubUrl).toBe("https://hub.example");
  });
});
