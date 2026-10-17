import { describe, it, expect } from "vitest";
import { appendPeoplePage, classifyPeopleError, EMPTY_PEOPLE } from "../alliancePeople";
import type { AlliancePerson } from "../../types";

const person = (k: string): AlliancePerson => ({ public_key: k, master_pubkey: `m${k}`, display_name: k, avatar: null });
const err = (status: number, message: string) => Object.assign(new Error(message), { status });

describe("classifyPeopleError", () => {
  it("maps the documented statuses", () => {
    expect(classifyPeopleError(err(404, "Alliance not found"))).toBe("not_available");
    expect(classifyPeopleError(err(409, "peer_unsupported"))).toBe("peer_unsupported");
    expect(classifyPeopleError(err(429, "rate_limited"))).toBe("rate_limited");
    expect(classifyPeopleError(err(502, "peer_unreachable"))).toBe("peer_unreachable");
  });
  it("does not read an unrelated 409 as peer_unsupported", () => {
    expect(classifyPeopleError(err(409, "conflict"))).toBe("other");
    expect(classifyPeopleError(new Error("boom"))).toBe("other");
  });
});

describe("appendPeoplePage", () => {
  it("keeps the cursor on a full page and walks to a short one", () => {
    const p1 = appendPeoplePage(EMPTY_PEOPLE, [person("a"), person("b")], 2);
    expect(p1.cursor).toBe("b");
    const p2 = appendPeoplePage(p1, [person("c")], 2);
    expect(p2.cursor).toBeNull();
    expect(p2.people.map((p) => p.public_key)).toEqual(["a", "b", "c"]);
  });
  it("drops duplicates across pages and ends on an empty page", () => {
    const p1 = appendPeoplePage(EMPTY_PEOPLE, [person("a"), person("b")], 2);
    const p2 = appendPeoplePage(p1, [person("b")], 1);
    expect(p2.people).toHaveLength(2);
    expect(appendPeoplePage(p2, []).cursor).toBeNull();
  });
});
