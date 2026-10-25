import { describe, expect, it } from "vitest";
import { classifyHubRefusal } from "./hubRefusal";

describe("classifyHubRefusal", () => {
  it("reads the invite gate", () => {
    expect(classifyHubRefusal(403, "This hub requires an invite code")).toEqual({
      kind: "invite_required",
      reason: "This hub requires an invite code",
    });
  });
  it("reads local and federated bans", () => {
    expect(classifyHubRefusal(403, "User is banned")?.kind).toBe("banned");
    expect(classifyHubRefusal(403, "Access denied")?.kind).toBe("banned");
  });
  it("keeps any other 403 body as the reason", () => {
    expect(classifyHubRefusal(403, "nope")).toEqual({ kind: "other", reason: "nope" });
  });
  it("does not treat pending approval or lobby confinement as a refusal", () => {
    expect(classifyHubRefusal(403, "Account is pending admin approval")).toBeNull();
    expect(classifyHubRefusal(403, "lobby_scope_confined")).toBeNull();
  });
  it("does not treat other statuses as a refusal", () => {
    expect(classifyHubRefusal(500, "User is banned")).toBeNull();
    expect(classifyHubRefusal(401, "Key has been revoked")).toBeNull();
    expect(classifyHubRefusal(404, "")).toBeNull();
  });
});
