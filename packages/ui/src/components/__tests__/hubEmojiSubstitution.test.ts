import { describe, it, expect } from "vitest";
import { substituteHubEmojis } from "../MessageContent";

// The emoji tag is spliced in after DOMPurify has run, so this interpolation is
// the only thing standing between a hostile `GET /emojis` response and script
// execution in every client that renders a message using that shortcode.
describe("substituteHubEmojis", () => {
  const map = (url: string, name = "wave") =>
    new Map([[name, { id: "1", name, url }]]);

  it("escapes a url that tries to close the src attribute", () => {
    const out = substituteHubEmojis("hi :wave:", map('x" onerror="alert(1)'), "");
    expect(out).not.toContain('onerror="');
    expect(out).toContain("&quot;");
  });

  it("escapes a url that tries to close the tag", () => {
    const out = substituteHubEmojis("hi :wave:", map("x/><script>alert(1)</script>"), "");
    expect(out).not.toContain("<script>");
  });

  it("escapes the emoji name, which the hub also controls", () => {
    const out = substituteHubEmojis("hi :wave:", map("/e/1.png", "wave"), "");
    expect(out).toContain('alt=":wave:"');
  });

  it("leaves a shortcode with no entry alone", () => {
    expect(substituteHubEmojis("hi :nope:", map("/e/1.png"), "")).toBe("hi :nope:");
  });

  it("prefixes the hub base url", () => {
    const out = substituteHubEmojis(":wave:", map("/e/1.png"), "https://hub.example");
    expect(out).toContain('src="https://hub.example/e/1.png"');
  });
});
