import { describe, it, expect } from "vitest";
import { visibleParticipants } from "../voicePresence";
import type { User, VoiceParticipant } from "@shared/types";

function user(public_key: string, online: boolean): User {
  return { public_key, display_name: null, avatar: null, online, group_role: null };
}

function participant(public_key: string): VoiceParticipant {
  return { public_key, display_name: null };
}

describe("visibleParticipants", () => {
  const users = [user("me", false), user("alice", true), user("bob", false)];

  it("hides participants whose presence is offline (including invisible users)", () => {
    const result = visibleParticipants(
      [participant("me"), participant("alice"), participant("bob")],
      users,
      "me",
    );
    expect(result.map((p) => p.public_key)).toEqual(["me", "alice"]);
  });

  it("always keeps self even while self is invisible", () => {
    const result = visibleParticipants([participant("me")], users, "me");
    expect(result).toHaveLength(1);
  });

  it("keeps participants with no matching user record (unknown presence defaults to visible)", () => {
    const result = visibleParticipants([participant("stranger")], users, "me");
    expect(result).toHaveLength(1);
  });
});
