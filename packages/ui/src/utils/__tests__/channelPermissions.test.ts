import { describe, it, expect } from "vitest";
import type { ChannelRolePermissions } from "../../types";
import {
  deriveRowStates,
  buildOverwritePayload,
  overwritableIds,
  type PermissionCatalogueEntry,
} from "../channelPermissions";

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

/** A slice of what `GET /permissions` returns, with both scopes present. */
const CATALOGUE: PermissionCatalogueEntry[] = [
  { id: "messages.read", scope: "hub_and_channel", group: "messages" },
  { id: "messages.send", scope: "hub_and_channel", group: "messages" },
  { id: "messages.manage", scope: "hub_and_channel", group: "messages" },
  { id: "voice.join", scope: "hub_and_channel", group: "voice" },
  { id: "roles.manage", scope: "hub", group: "roles" },
  { id: "hub.settings", scope: "hub", group: "hub" },
];

const IDS = overwritableIds(CATALOGUE);

describe("overwritableIds", () => {
  it("keeps only what the hub says has a channel dimension", () => {
    expect(IDS).toEqual(["messages.read", "messages.send", "messages.manage", "voice.join"]);
  });

  it("drops hub-only permissions, which the hub refuses with a 400", () => {
    // Offering one would be a checkbox that looks like it worked and granted
    // nothing — the same shape as the unvalidated strings the catalogue exists
    // to end.
    expect(IDS).not.toContain("roles.manage");
    expect(IDS).not.toContain("hub.settings");
  });

  it("offers nothing against a hub that serves no catalogue", () => {
    // An older hub's ids are the snake_case set and share no spelling with
    // these, so an empty list is the honest answer rather than a fallback to
    // whatever this build happens to know.
    expect(overwritableIds([])).toEqual([]);
  });

  it("carries an id this build has never heard of", () => {
    // Every client here is multi-hub: the copy served by hub A talks to hubs B
    // and C, and one of them may be newer. Hiding the row would hide a
    // permission that exists.
    const withNew = overwritableIds([
      ...CATALOGUE,
      { id: "messages.pin", scope: "hub_and_channel", group: "messages" },
    ]);
    expect(withNew).toContain("messages.pin");
  });
});

describe("deriveRowStates", () => {
  it("marks permissions with no overwrite row as inherit", () => {
    const rows = deriveRowStates(makeRole(), IDS);
    expect(rows["messages.read"]).toBe("inherit");
    expect(rows["messages.send"]).toBe("inherit");
  });

  it("marks permissions in overwrites.allow as allow", () => {
    const role = makeRole({ overwrites: { allow: ["messages.manage"], deny: [] } });
    expect(deriveRowStates(role, IDS)["messages.manage"]).toBe("allow");
  });

  it("marks permissions in overwrites.deny as deny", () => {
    const role = makeRole({ overwrites: { allow: [], deny: ["voice.join"] } });
    expect(deriveRowStates(role, IDS)["voice.join"]).toBe("deny");
  });

  it("covers every id it is given, not just the ones with a row", () => {
    const role = makeRole({ overwrites: { allow: ["messages.read"], deny: [] } });
    const rows = deriveRowStates(role, IDS);
    expect(Object.keys(rows).sort()).toEqual([...IDS].sort());
  });

  it("ignores a stored row for an id outside the list", () => {
    // A hub-only permission cannot be stored as an overwrite any more, but a
    // row written before that guard existed must not resurrect a checkbox.
    const role = makeRole({ overwrites: { allow: ["roles.manage"], deny: [] } });
    expect(deriveRowStates(role, IDS)["roles.manage"]).toBeUndefined();
  });
});

describe("buildOverwritePayload", () => {
  it("splits rows into allow/deny arrays and drops inherit rows", () => {
    const payload = buildOverwritePayload({
      "messages.read": "allow",
      "messages.send": "deny",
      "voice.join": "inherit",
    });
    expect(payload.allow).toEqual(["messages.read"]);
    expect(payload.deny).toEqual(["messages.send"]);
  });

  it("sends nothing when every row is inherit", () => {
    const payload = buildOverwritePayload({ "messages.read": "inherit" });
    expect(payload).toEqual({ allow: [], deny: [] });
  });
});
