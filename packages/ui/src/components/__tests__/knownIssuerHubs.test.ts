import { describe, expect, it } from "vitest";
import { knownIssuerHubs } from "../settings/IssuerHubPicker";

const hub = (id: string, url: string) => ({ hub_id: id, hub_name: `Hub ${id}`, hub_url: url, hub_icon: null });

describe("knownIssuerHubs", () => {
  it("lists joined hubs and alliance partners once each, never the hub being administered", () => {
    const out = knownIssuerHubs(
      [hub("a", "https://a.example"), hub("own", "https://own.example/")],
      [
        { hub_public_key: "a", hub_name: "A again", hub_url: "https://a.example" },
        { hub_public_key: "p", hub_name: "Partner", hub_url: "https://p.example" },
      ],
      "https://own.example",
    );
    expect(out.map((h) => [h.pubkey, h.name])).toEqual([
      ["a", "Hub a"],
      ["p", "Partner"],
    ]);
  });
});
