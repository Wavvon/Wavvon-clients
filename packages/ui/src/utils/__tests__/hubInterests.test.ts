import { describe, expect, it } from "vitest";
import { matchHubs, orderByLatency, type HubInterests } from "../hubInterests";
import type { HubListing } from "../../types";

function hub(name: string, tags: string[], language: string, invite_only = false): HubListing {
  return {
    hub_pubkey: name, hub_url: `https://${name}.example`, name, description: null, icon: null,
    invite_only, min_security_level: 0, invite_code: null, bio: "", tags, language,
  };
}

const none: HubInterests = { tags: [], languages: [], openOnly: false, nearestFirst: false };
const hubs = [
  hub("a", ["gaming", "music"], "en"),
  hub("b", ["art"], "it"),
  hub("c", ["Gaming"], "it", true),
];

describe("matchHubs", () => {
  it("keeps everything when nothing is chosen", () => {
    expect(matchHubs(hubs, none).map((s) => s.hub.name)).toEqual(["a", "b", "c"]);
  });

  it("matches any chosen tag, case-insensitively, and says which", () => {
    const r = matchHubs(hubs, { ...none, tags: ["gaming", "sports"] });
    expect(r.map((s) => s.hub.name)).toEqual(["a", "c"]);
    expect(r[1].matchedTags).toEqual(["Gaming"]);
  });

  it("filters by language and by open hubs only", () => {
    expect(matchHubs(hubs, { ...none, languages: ["it"] }).map((s) => s.hub.name)).toEqual(["b", "c"]);
    expect(matchHubs(hubs, { ...none, languages: ["it"], openOnly: true }).map((s) => s.hub.name)).toEqual(["b"]);
  });
});

describe("orderByLatency", () => {
  it("puts the nearest first and the silent last, keeping ties stable", () => {
    const base = matchHubs(hubs, none);
    const timed = base.map((s, i) => ({ ...s, latencyMs: [null, 80, 20][i] }));
    expect(orderByLatency(timed).map((s) => s.hub.name)).toEqual(["c", "b", "a"]);
  });
});
