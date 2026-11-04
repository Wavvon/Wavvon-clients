import { describe, it, expect } from "vitest";
import { memberActivity } from "../memberActivity";
import { groupMembers } from "../../components/users/UserListGrouped";
import type { User } from "../../types";

describe("memberActivity", () => {
  it("says in voice, and live over voice, in a channel it can name", () => {
    const names: Record<string, string> = { v1: "Lounge" };
    const map = memberActivity(
      { v1: [{ public_key: "a" }, { public_key: "b" }], gone: [{ public_key: "c" }] },
      [{ channel_id: "v1", sharer_pubkey: "b", kind: "screen" }, { channel_id: "v1", sharer_pubkey: "a", kind: "webcam" }],
      (id) => names[id],
    );
    expect(map.get("a")).toEqual({ kind: "voice", channel: "Lounge" });
    expect(map.get("b")).toEqual({ kind: "live", channel: "Lounge" });
    expect(map.has("c")).toBe(false);
  });
});

describe("groupMembers", () => {
  const u = (pk: string, online: boolean, role: string | null, priority?: number): User =>
    ({ public_key: pk, display_name: pk, avatar: null, online, group_role: role, group_role_priority: priority } as User);

  it("puts hoisted roles in role order, then members, then everyone offline", () => {
    const sections = groupMembers(
      [u("m", true, null), u("mod", true, "Mods", 50), u("adm", true, "Admins", 90), u("off", false, "Admins", 90)],
      "Members",
      "Offline",
    );
    expect(sections.map((s) => [s.title, s.users.map((x) => x.public_key)])).toEqual([
      ["Admins", ["adm"]],
      ["Mods", ["mod"]],
      ["Members", ["m"]],
      ["Offline", ["off"]],
    ]);
  });
});
