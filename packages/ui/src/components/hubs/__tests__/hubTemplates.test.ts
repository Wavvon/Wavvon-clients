import { channelTypeFor } from "../HubSetupWizard";
import { describe, it, expect } from "vitest";
import { HUB_TEMPLATES, orderPlanSteps, firstTextChannelKey } from "../hubTemplates";

describe("hub setup templates", () => {
  for (const template of HUB_TEMPLATES) {
    it(`${template.id}: every parentKey resolves to a category in the same template`, () => {
      const categoryKeys = new Set(
        template.channels.filter((c) => c.kind === "category").map((c) => c.key),
      );
      for (const c of template.channels) {
        if (c.parentKey) expect(categoryKeys.has(c.parentKey)).toBe(true);
      }
    });

    it(`${template.id}: has roughly 8-12 channels including categories`, () => {
      // reading is a bit leaner (7) — matches the design's channel list exactly.
      expect(template.channels.length).toBeGreaterThanOrEqual(7);
      expect(template.channels.length).toBeLessThanOrEqual(12);
    });

    it(`${template.id}: has a first text channel to auto-select`, () => {
      expect(firstTextChannelKey(template)).toBeDefined();
    });
  }

  it("orderPlanSteps puts every category before the leaves that reference it", () => {
    for (const template of HUB_TEMPLATES) {
      const ordered = orderPlanSteps(template.channels);
      const indexOf = new Map(ordered.map((c, i) => [c.key, i]));
      for (const c of ordered) {
        if (c.parentKey) expect(indexOf.get(c.parentKey)!).toBeLessThan(indexOf.get(c.key)!);
      }
    }
  });

  it("orderPlanSteps keeps template order when parents already precede children", () => {
    // Creation order becomes sidebar display_order — root leaves like
    // "welcome" must stay where the template put them (the top).
    for (const template of HUB_TEMPLATES) {
      expect(orderPlanSteps(template.channels).map((c) => c.key)).toEqual(
        template.channels.map((c) => c.key),
      );
    }
  });

  it("orderPlanSteps hoists a parent listed after its child", () => {
    const ordered = orderPlanSteps([
      { key: "orphan", kind: "text", parentKey: "cat" },
      { key: "cat", kind: "category" },
    ] as never);
    expect(ordered.map((c) => c.key)).toEqual(["cat", "orphan"]);
  });
});

describe("channelTypeFor", () => {
  it("makes voice rooms voice channels where the hub has the type", () => {
    expect(channelTypeFor("voice", true)).toBe("voice");
  });

  it("falls back to text on a hub older than channels.voice", () => {
    expect(channelTypeFor("voice", false)).toBe("text");
  });
});
