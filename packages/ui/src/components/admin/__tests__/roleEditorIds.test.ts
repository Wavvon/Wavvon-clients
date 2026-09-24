import { describe, expect, it } from "vitest";
import { roleEditorIds } from "../RolesSection";

describe("roleEditorIds", () => {
  it("offers the hub's catalogue, in the hub's order", () => {
    expect(roleEditorIds(["messages.read", "messages.send"], [])).toEqual([
      "messages.read",
      "messages.send",
    ]);
  });

  it("offers an id this build has never heard of, because the hub enforces it", () => {
    expect(roleEditorIds(["messages.read", "surveys.manage"], [])).toContain("surveys.manage");
  });

  it("keeps a grant the catalogue does not list, so it can still be removed", () => {
    // A hub too old to serve a catalogue: the list is empty, and without this
    // the editor would show nothing while the role holds three permissions.
    expect(roleEditorIds([], ["read_messages", "send_messages"])).toEqual([
      "read_messages",
      "send_messages",
    ]);
  });

  it("does not offer the same id twice", () => {
    expect(roleEditorIds(["messages.read"], ["messages.read"])).toEqual(["messages.read"]);
  });
});
