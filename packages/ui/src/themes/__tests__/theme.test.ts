import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { PackageError } from "../packageFormat";
import { contrastRatio, contrastWarnings } from "../contrast";
import { ICON_NAMES } from "../iconRegistry";
import { exportTheme, loadTheme, newTheme, resolveScheme } from "../theme";

const manifest = (extra: object = {}) =>
  JSON.stringify({ format: "wavvon.theme", version: 1, name: "T", colors: { dark: { "--accent": "#ff8fb1" } }, ...extra });
const zip = (files: Record<string, Uint8Array | string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === "string" ? strToU8(v) : v])));

describe("loadTheme", () => {
  it("loads a package, ignoring unknown blocks and tokens", () => {
    const pkg = loadTheme(zip({ "theme.json": manifest({ future: { x: 1 }, colors: { dark: { "--accent": "#fff", "--nope": "red" } } }) }));
    expect(pkg.manifest.colors.dark).toEqual({ "--accent": "#fff" });
  });

  it("round-trips through export", () => {
    const pkg = loadTheme(exportTheme(newTheme("Mine", "light")));
    expect(pkg.manifest.name).toBe("Mine");
    expect(pkg.manifest.colors.light).toEqual({});
  });

  it.each([
    ["traversal", { "theme.json": manifest(), "../x.png": "a" }],
    ["absolute path", { "theme.json": manifest(), "/x.png": "a" }],
    ["disallowed type", { "theme.json": manifest(), "run.js": "a" }],
    ["oversized image", { "theme.json": manifest(), "a.png": new Uint8Array(2 * 1024 * 1024 + 1) }],
    ["oversized sound", { "theme.json": manifest(), "a.ogg": new Uint8Array(256 * 1024 + 1) }],
    ["no manifest", { "a.png": "x" }],
    ["bad token value", { "theme.json": manifest({ colors: { dark: { "--accent": "url(http://x)" } } }) }],
    ["no colors", { "theme.json": manifest({ colors: {} }) }],
  ])("rejects %s", (_n, files) => {
    expect(() => loadTheme(zip(files))).toThrow(PackageError);
  });

  it("rejects a non-zip", () => {
    expect(() => loadTheme(strToU8("nope"))).toThrow(PackageError);
  });
});

describe("resolveScheme", () => {
  const both = loadTheme(zip({ "theme.json": manifest({ colors: { dark: {}, light: {} } }) })).manifest;
  const darkOnly = loadTheme(zip({ "theme.json": manifest() })).manifest;
  it("follows the mode only when both schemes exist", () => {
    expect(resolveScheme(both, "system", false)).toBe("light");
    expect(resolveScheme(both, "dark", false)).toBe("dark");
    expect(resolveScheme(darkOnly, "light", false)).toBe("dark");
    expect(resolveScheme(null, "system", true)).toBe("dark");
  });
});

describe("contrast", () => {
  it("measures WCAG ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    const w = contrastWarnings((t) => (t === "--text" ? "#777777" : "#808080"));
    expect(w.some((x) => x.text === "--text")).toBe(true);
  });
});

describe("icons", () => {
  const png = new Uint8Array([1, 2, 3]);
  const withIcons = (icons: object, files: Record<string, Uint8Array | string> = { "icons/m.png": png }) =>
    zip({ "theme.json": manifest({ icons }), ...files });

  it("loads known icons and ignores unknown names", () => {
    const pkg = loadTheme(withIcons({ mic: "icons/m.png", "not-an-icon": "icons/x.png" }));
    expect(pkg.manifest.icons).toEqual({ mic: "icons/m.png" });
  });

  it("covers every channel glyph id", async () => {
    const src = (await import("node:fs")).readFileSync(new URL("../../components/Icons.tsx", import.meta.url), "utf8");
    const ids = [...src.matchAll(/\{ id: "([a-z]+)", paths/g)].map((m) => m[1]);
    for (const id of ids) expect(ICON_NAMES).toContain(`channel-${id}`);
  });

  it.each([
    ["missing file", withIcons({ mic: "icons/gone.png" })],
    ["non-image", withIcons({ mic: "icons/m.ogg" }, { "icons/m.ogg": png })],
    ["over 64 KB", withIcons({ mic: "icons/m.png" }, { "icons/m.png": new Uint8Array(64 * 1024 + 1) })],
    ["path traversal", withIcons({ mic: "../m.png" })],
  ])("rejects %s", (_n, bytes) => {
    expect(() => loadTheme(bytes)).toThrow(PackageError);
  });
});
