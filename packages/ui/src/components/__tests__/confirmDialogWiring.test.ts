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
 * `useConfirm()` hands back a promise and the element that resolves it. If that
 * element is never in the tree, the promise never settles: the click lands, no
 * dialog appears, and the action silently never happens.
 *
 * Two files shipped exactly that. In one, `{dialog}` sat inside the branch
 * rendered only when loading had failed; in the other it was missing outright.
 * Nothing failed to compile, nothing threw, and the admin page looked correct
 * until someone tried to delete a role.
 */
describe("useConfirm wiring", () => {
  const offenders: string[] = [];

  for (const file of sourceFiles(SRC)) {
    const src = readFileSync(file, "utf8");
    if (!/useConfirm\(\)/.test(src)) continue;
    if (file.endsWith("ConfirmDialog.tsx")) continue;

    // The component's own render is its last top-level `return (` — earlier
    // ones are the loading and error branches.
    const lines = src.split(/\r?\n/);
    let mainReturn = -1;
    lines.forEach((l, i) => { if (/^ {2}return \($/.test(l)) mainReturn = i; });

    const dialogLines = lines.flatMap((l, i) => (l.includes("{dialog}") ? [i] : []));
    if (mainReturn < 0 || !dialogLines.some((i) => i > mainReturn)) {
      offenders.push(file.slice(SRC.length + 1).replace(/\\/g, "/"));
    }
  }

  it("renders {dialog} in the component's own return, not only an early one", () => {
    expect(offenders).toEqual([]);
  });

  it("finds the components that use it, so an empty pass is not a false one", () => {
    const users = sourceFiles(SRC).filter(
      (f) => /useConfirm\(\)/.test(readFileSync(f, "utf8")) && !f.endsWith("ConfirmDialog.tsx"),
    );
    expect(users.length).toBeGreaterThan(5);
  });
});
