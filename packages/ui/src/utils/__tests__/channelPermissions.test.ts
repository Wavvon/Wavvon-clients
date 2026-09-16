import { describe, it, expect } from "vitest";
import type { ChannelRolePermissions } from "../../types";
import { deriveRowStates, buildOverwritePayload, overwritePermissionsFor } from "../channelPermissions";

function makeRole(overrides: Partial<ChannelRolePermissions> = {}): ChannelRolePermissions {
  return {
    role_id: "builtin-everyone",
    role_name: "everyone",
    overwrites: { allow: [], deny: [] },
    inherited: [],
    effective: [],
    ...overrides,
  };
}

describe("deriveRowStates", () => {
  it("marks permissions with no overwrite row as inherit", () => {
    const role = makeRole();
    const rows = deriveRowStates(role);
    expect(rows["read_messages"]).toBe("inherit");
    expect(rows["send_messages"]).toBe("inherit");
  });

  it("marks permissions in overwrites.allow as allow", () => {
    const role = makeRole({ overwrites: { allow: ["manage_messages"], deny: [] } });
    const rows = deriveRowStates(role);
    expect(rows["manage_messages"]).toBe("allow");
  });

  it("marks permissions in overwrites.deny as deny", () => {
    const role = makeRole({ overwrites: { allow: [], deny: ["read_messages"] } });
    const rows = deriveRowStates(role);
    expect(rows["read_messages"]).toBe("deny");
  });

  it("covers every channel-overwrite-eligible permission, not just the ones present in overwrites", () => {
    const role = makeRole({ overwrites: { allow: ["send_messages"], deny: [] } });
    const rows = deriveRowStates(role);
    expect(Object.keys(rows).length).toBeGreaterThan(1);
    expect(rows["create_events"]).toBe("inherit");
  });
});

describe("buildOverwritePayload", () => {
  it("splits rows into allow/deny arrays and drops inherit rows", () => {
    const rows = {
      read_messages: "inherit" as const,
      send_messages: "allow" as const,
      manage_messages: "deny" as const,
    };
    const payload = buildOverwritePayload(rows);
    expect(payload.allow).toEqual(["send_messages"]);
    expect(payload.deny).toEqual(["manage_messages"]);
  });

  it("returns empty arrays when every row is inherit", () => {
    const rows = { read_messages: "inherit" as const, send_messages: "inherit" as const };
    const payload = buildOverwritePayload(rows);
    expect(payload.allow).toEqual([]);
    expect(payload.deny).toEqual([]);
  });

  it("round-trips through deriveRowStates", () => {
    const role = makeRole({ overwrites: { allow: ["manage_channels"], deny: ["kick_members"] } });
    const rows = deriveRowStates(role);
    const payload = buildOverwritePayload(rows);
    expect(payload.allow).toEqual(["manage_channels"]);
    expect(payload.deny).toEqual(["kick_members"]);
  });
});

describe("overwritePermissionsFor", () => {
  it("drops voice.join against a hub that does not advertise voice.permissions", () => {
    const ids = overwritePermissionsFor(["list.cursor", "voice.wt"]).map((p) => p.id);
    expect(ids).not.toContain("voice.join");
    // Everything ungated is still there.
    expect(ids).toContain("read_messages");
    expect(ids).toContain("move_members");
  });

  it("offers voice.join once the hub advertises it", () => {
    const ids = overwritePermissionsFor(["voice.permissions"]).map((p) => p.id);
    expect(ids).toContain("voice.join");
  });

  it("treats an empty capability list as none known", () => {
    // Unknown resolves to absent, not present: offering a row the hub has
    // never heard of gets a 400 on save, and the admin cannot tell that from
    // a permission that simply failed to apply.
    expect(overwritePermissionsFor([]).map((p) => p.id)).not.toContain("voice.join");
  });
});
