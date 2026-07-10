import { describe, it, expect } from "vitest";
import type { ChannelRolePermissions } from "@shared/types";
import { deriveRowStates, buildOverwritePayload } from "@components/channels/ChannelPermissionsTab";

function makeRole(overrides: Partial<ChannelRolePermissions> = {}): ChannelRolePermissions {
  return {
    role_id: "builtin-everyone",
    role_name: "@everyone",
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
