import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const UI = join(__dirname, "..");
const CSS = readFileSync(join(UI, "styles.css"), "utf8");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "__tests__") out.push(...sourceFiles(path));
    } else if (/\.(tsx|ts|css)$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Two rules about custom properties, and they are the same rule twice.
 *
 * A `var(--x)` whose token nobody defines falls through to its fallback, or
 * to nothing, and says nothing about it. That is how 218 declarations came
 * to render another product's palette in every theme: each had a fallback,
 * each fallback was that palette, and no theme could reach past them.
 *
 * So: every token the stylesheet reads must be defined, and no read may
 * carry a colour fallback — the fallback is what makes a missing token look
 * like a working one.
 */
describe("design tokens", () => {
  const defined = new Set(
    Array.from(CSS.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm), (m) => m[1]),
  );

  it("defines every token the stylesheet reads", () => {
    // A component may set a property per element — the avatar its hue, a role
    // its colour — so a token the TSX writes counts as defined.
    const fromTsx = new Set<string>();
    for (const file of sourceFiles(UI)) {

      for (const m of readFileSync(file, "utf8").matchAll(/["'](--[a-z0-9-]+)["']\s*(?:as [A-Za-z]+)?\]?\s*:/g)) {
        fromTsx.add(m[1]);
      }
    }
    const read = new Set(
      Array.from(CSS.matchAll(/var\((--[a-z0-9-]+)/g), (m) => m[1]),
    );
    const missing = [...read].filter((t) => !defined.has(t) && !fromTsx.has(t)).sort();
    expect(missing).toEqual([]);
  });

  it("reads no token through a colour fallback", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(UI)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/var\(--[a-z0-9-]+,\s*(#[0-9a-fA-F]{3,8}|rgba?\()/g)) {
        offenders.push(`${file.slice(UI.length + 1).replace(/\\/g, "/")}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
