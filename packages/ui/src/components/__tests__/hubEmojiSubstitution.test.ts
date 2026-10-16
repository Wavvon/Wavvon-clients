// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { decorateMessageHtml } from "../MessageContent";

// Emoji and mentions are added after DOMPurify has run, so this is the only
// thing standing between a hostile `GET /emojis` response — or an ordinary
// link — and markup the sanitizer never saw.
describe("decorateMessageHtml", () => {
  const map = (url: string, name = "wave") =>
    new Map([[name, { id: "1", name, url }]]);
  const run = (html: string, url = "/e/1.png", base = "", names: string[] = []) =>
    decorateMessageHtml(html, {
      hubEmojiMap: map(url),
      hubBaseUrl: base,
      knownNames: new Set(names),
      myLower: null,
    });
  const parse = (html: string) => {
    const t = document.createElement("template");
    t.innerHTML = html;
    return t.content;
  };

  it("keeps a hostile url inside the src attribute", () => {
    const out = parse(run("<p>hi :wave:</p>", 'https://e/x" onerror="alert(1)'));
    const img = out.querySelector("img")!;
    expect(img.getAttribute("src")).toBe('https://e/x" onerror="alert(1)');
    expect(img.hasAttribute("onerror")).toBe(false);
  });

  it("leaves a non-http emoji url as text", () => {
    const out = parse(run("<p>hi :wave:</p>", "javascript:alert(1)"));
    expect(out.querySelector("img")).toBeNull();
    expect(out.textContent).toBe("hi :wave:");
  });

  it("never touches a shortcode or a mention inside an href", () => {
    const html = '<p><a href="https://e/:wave:/@alice">link</a></p>';
    const out = parse(run(html, "/e/1.png", "", ["alice"]));
    const a = out.querySelector("a")!;
    expect(a.getAttribute("href")).toBe("https://e/:wave:/@alice");
    expect(a.attributes.length).toBe(1);
  });

  it("leaves code alone", () => {
    const out = parse(run("<p><code>:wave: @alice</code></p>", "/e/1.png", "", ["alice"]));
    expect(out.querySelector("img, .mention")).toBeNull();
  });

  it("names the emoji in alt and title", () => {
    const img = parse(run("<p>hi :wave:</p>")).querySelector("img")!;
    expect(img.getAttribute("alt")).toBe(":wave:");
    expect(img.getAttribute("title")).toBe(":wave:");
  });

  it("leaves a shortcode with no entry alone", () => {
    expect(run("<p>hi :nope:</p>")).toBe("<p>hi :nope:</p>");
  });

  it("prefixes the hub base url", () => {
    const img = parse(run("<p>:wave:</p>", "/e/1.png", "https://hub.example")).querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://hub.example/e/1.png");
  });

  it("marks a known mention, and only a known one", () => {
    const out = parse(run("<p>@alice and @bob</p>", "/e/1.png", "", ["alice"]));
    const spans = out.querySelectorAll(".mention");
    expect(spans.length).toBe(1);
    expect(spans[0].textContent).toBe("@alice");
  });
});
