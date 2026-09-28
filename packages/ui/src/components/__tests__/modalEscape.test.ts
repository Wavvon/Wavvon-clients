import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "__tests__") out.push(...sourceFiles(path));
    } else if (entry.endsWith(".tsx")) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Ten of the twenty-three overlays shipped without a way to close them from
 * the keyboard. Every one already dismissed on an overlay click, so it was
 * never a question of whether they should dismiss — the mouse could do what
 * the keyboard could not, and the user profile card trapped anyone who
 * opened it by keyboard.
 *
 * Nothing failed to compile and no suite noticed: a missing listener looks
 * exactly like a component that does not need one.
 */
describe("modal escape", () => {
  const files = sourceFiles(SRC).filter((f) =>
    /className=\{?["'`][^"'`]*modal-overlay/.test(readFileSync(f, "utf8")),
  );

  const offenders = files.filter((f) => {
    const src = readFileSync(f, "utf8");
    // The shared hook, or a listener on window. An `onKeyDown` on an input
    // or on the overlay is not coverage: it only fires while focus is
    // already inside, so reloading with the modal up leaves no way out.
    const hook = /useCloseOnEscape\s*\(/.test(src);
    const onWindow = /window\.addEventListener\(\s*["']keydown["']/.test(src);
    return !hook && !onWindow;
  });

  it("every overlay can be dismissed from the keyboard", () => {
    expect(offenders.map((f) => f.slice(SRC.length + 1).replace(/\\/g, "/"))).toEqual([]);
  });

  it("finds the overlays, so an empty pass is not a false one", () => {
    expect(files.length).toBeGreaterThan(15);
  });
});
