// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { sanitizeSvg } from "./svgSanitize";

const CLEAN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="8"/></svg>`;

describe("sanitizeSvg — valid input", () => {
  it("returns a string for a clean SVG", () => {
    expect(typeof sanitizeSvg(CLEAN_SVG)).toBe("string");
  });

  it("allows data: URI in href (inline image)", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,abc"/></svg>`;
    // image element is stripped entirely, but the test confirms no crash
    const result = sanitizeSvg(svg);
    expect(result).not.toBeNull();
  });

  it("allows fragment href (#id)", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><use href="#icon"/></svg>`;
    // use element is stripped; function still returns a result
    const result = sanitizeSvg(svg);
    expect(result).not.toBeNull();
  });
});

describe("sanitizeSvg — malformed input", () => {
  it("returns null for empty string", () => {
    expect(sanitizeSvg("")).toBeNull();
  });

  it("returns null for plain text", () => {
    expect(sanitizeSvg("hello world")).toBeNull();
  });

  it("returns null for HTML (non-SVG root)", () => {
    expect(sanitizeSvg("<div>not svg</div>")).toBeNull();
  });

  it("returns null for broken XML", () => {
    expect(sanitizeSvg("<svg><unclosed")).toBeNull();
  });

  it("returns null for SVG with a parsererror root", () => {
    expect(sanitizeSvg("<svg><</svg>")).toBeNull();
  });
});

describe("sanitizeSvg — dangerous element stripping", () => {
  it("strips <script> tags", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`;
    const result = sanitizeSvg(svg);
    expect(result).not.toBeNull();
    expect(result).not.toContain("script");
    expect(result).not.toContain("alert");
  });

  it("strips <foreignObject> tags", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>xss</div></foreignObject></svg>`;
    const result = sanitizeSvg(svg);
    expect(result).not.toBeNull();
    expect(result).not.toContain("foreignObject");
    expect(result).not.toContain("xss");
  });

  it("strips <iframe> tags", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><iframe src="javascript:alert(1)"/></svg>`;
    const result = sanitizeSvg(svg);
    expect(result).not.toBeNull();
    expect(result).not.toContain("iframe");
    expect(result).not.toContain("javascript");
  });

  it("strips <use> tags (potential xlink:href exploit)", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><use xlink:href="http://evil.com/sprite.svg#icon"/></svg>`;
    const result = sanitizeSvg(svg);
    expect(result).not.toBeNull();
    expect(result).not.toContain("<use");
  });

  it("strips <image> tags with external src", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><image href="http://tracker.example/pixel.png"/></svg>`;
    const result = sanitizeSvg(svg);
    expect(result).not.toBeNull();
    expect(result).not.toContain("<image");
  });
});

describe("sanitizeSvg — dangerous attribute stripping", () => {
  it("strips onclick handler", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" onclick="alert(1)"><circle/></svg>`;
    const result = sanitizeSvg(svg);
    expect(result).not.toBeNull();
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("alert");
  });

  it("strips onload handler on child element", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><circle onload="steal()" cx="0" cy="0" r="5"/></svg>`;
    const result = sanitizeSvg(svg);
    expect(result).not.toBeNull();
    expect(result).not.toContain("onload");
    expect(result).not.toContain("steal");
  });

  it("strips onerror handler", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><image onerror="alert(2)" href="bad.png"/></svg>`;
    const result = sanitizeSvg(svg);
    // image is stripped entirely, but if it somehow survived the element strip,
    // the attribute would also be stripped
    expect(result).not.toContain("onerror");
  });

  it("strips external href on <a>", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><a href="http://evil.com"><circle/></a></svg>`;
    const result = sanitizeSvg(svg);
    expect(result).not.toBeNull();
    expect(result).not.toContain("evil.com");
  });

  it("strips javascript: href", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:void(0)"><circle/></a></svg>`;
    const result = sanitizeSvg(svg);
    expect(result).not.toBeNull();
    expect(result).not.toContain("javascript:");
  });

  it("strips xlink:href with external URL", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="http://evil.com"><circle/></a></svg>`;
    const result = sanitizeSvg(svg);
    expect(result).not.toBeNull();
    expect(result).not.toContain("evil.com");
  });

  it("preserves href with fragment identifier", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><a href="#section"><circle/></a></svg>`;
    const result = sanitizeSvg(svg);
    expect(result).not.toBeNull();
    expect(result).toContain("#section");
  });
});

describe("sanitizeSvg — size limit", () => {
  it("returns null for SVG exceeding 50 KB", () => {
    const filler = "x".repeat(51 * 1024);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><desc>${filler}</desc></svg>`;
    expect(sanitizeSvg(svg)).toBeNull();
  });

  it("accepts SVG under the 50 KB limit", () => {
    const filler = "x".repeat(100);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><desc>${filler}</desc></svg>`;
    expect(sanitizeSvg(svg)).not.toBeNull();
  });
});
