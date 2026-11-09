import { describe, it, expect } from "vitest";
import { widgetEmbedCode } from "../admin/WidgetSection";

describe("widgetEmbedCode", () => {
  it("frames the hub's /widget page whatever the trailing slash", () => {
    expect(widgetEmbedCode("https://hub.example/")).toContain('src="https://hub.example/widget"');
    expect(widgetEmbedCode("https://hub.example/hub/x")).toContain('src="https://hub.example/hub/x/widget"');
  });
});
