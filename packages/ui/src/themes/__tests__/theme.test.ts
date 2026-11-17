import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { PackageError } from "../packageFormat";
import { contrastRatio, contrastWarnings } from "../contrast";
import { audioDurationSeconds } from "../audioDuration";
import { translucent } from "../background";
import { resolveLayout } from "../layout";
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

describe("background", () => {
  const png = new Uint8Array([1, 2, 3]);
  const withBg = (background: object, files: Record<string, Uint8Array | string> = { "bg.png": png }) =>
    zip({ "theme.json": manifest({ background }), ...files });

  it("clamps out-of-range numbers and falls back on an unknown fit", () => {
    const bg = loadTheme(withBg({ image: "bg.png", fit: "wild", dim: 5, panel_opacity: 0.1, blur: 99 })).manifest.background;
    expect(bg).toEqual({ image: "bg.png", fit: "cover", dim: 0.9, panel_opacity: 0.6, blur: 20 });
  });

  it("defaults to a safe dim", () => {
    expect(loadTheme(withBg({ image: "bg.png" })).manifest.background?.dim).toBe(0.45);
  });

  it.each([
    ["missing file", withBg({ image: "nope.png" })],
    ["non-image", withBg({ image: "a.ogg" }, { "a.ogg": png })],
    ["no image field", withBg({ fit: "cover" })],
    ["traversal", withBg({ image: "../bg.png" })],
  ])("rejects %s", (_n, bytes) => {
    expect(() => loadTheme(bytes)).toThrow(PackageError);
  });

  it("makes a colour translucent", () => {
    expect(translucent("#102030", 0.8)).toBe("rgba(16, 32, 48, 0.8)");
    expect(translucent("rgba(1, 2, 3, 0.5)", 0.7)).toBe("rgba(1, 2, 3, 0.7)");
    expect(translucent("nonsense", 0.7)).toBeNull();
  });
});

describe("layout", () => {
  it("drops unknown keys and values, which means the default", () => {
    const pkg = loadTheme(zip({ "theme.json": manifest({ layout: { member_list: "left", tabs: "diagonal", future_key: "x", density: "compact" } }) }));
    expect(pkg.manifest.layout).toEqual({ member_list: "left", density: "compact" });
  });

  it("lets the user's choice beat the theme's, and the theme's beat the default", () => {
    expect(resolveLayout({ member_list: "left", density: "compact" }, { member_list: "hidden" })).toEqual({
      member_list: "hidden",
      channel_list: "tree",
      tabs: "top",
      density: "compact",
      avatar_shape: "square",
    });
  });
});

describe("preview", () => {
  const withPreview = (preview: string, files: Record<string, Uint8Array | string> = { "preview.webp": new Uint8Array([1]) }) =>
    zip({ "theme.json": manifest({ preview }), ...files });

  it("keeps a preview image that is in the package", () => {
    expect(loadTheme(withPreview("preview.webp")).manifest.preview).toBe("preview.webp");
  });

  it.each([
    ["missing file", withPreview("gone.webp")],
    ["non-image", withPreview("a.ogg", { "a.ogg": new Uint8Array([1]) })],
    ["traversal", withPreview("../p.webp")],
  ])("rejects %s", (_n, bytes) => {
    expect(() => loadTheme(bytes)).toThrow(PackageError);
  });
});

function wavBytes(seconds: number): Uint8Array {
  const rate = 8000;
  const data = Math.round(seconds * rate);
  const b = new Uint8Array(44 + data);
  const v = new DataView(b.buffer);
  const tag = (at: number, s: string) => [...s].forEach((c, i) => (b[at + i] = c.charCodeAt(0)));
  tag(0, "RIFF");
  v.setUint32(4, 36 + data, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  tag(36, "data");
  v.setUint32(40, data, true);
  return b;
}

describe("sounds", () => {
  const withSound = (sounds: object, files: Record<string, Uint8Array | string>) =>
    zip({ "theme.json": manifest({ sounds }), ...files });

  it("reads lengths from the file headers", async () => {
    expect(audioDurationSeconds(wavBytes(2), "a.wav")).toBeCloseTo(2, 2);
    const fs = await import("node:fs");
    const ogg = new Uint8Array(fs.readFileSync(new URL("../../../../../apps/web/e2e/fixtures/tone-440.ogg", import.meta.url)));
    const s = audioDurationSeconds(ogg, "tone.ogg");
    expect(s).not.toBeNull();
    expect(s!).toBeGreaterThan(0);
    expect(s!).toBeLessThan(5);
  });

  it("loads known sounds and ignores unknown names", () => {
    const pkg = loadTheme(withSound({ mention: "sounds/m.wav", nonsense: "sounds/x.wav" }, { "sounds/m.wav": wavBytes(1) }));
    expect(pkg.manifest.sounds).toEqual({ mention: "sounds/m.wav" });
  });

  it.each([
    ["over 5 seconds", withSound({ mention: "sounds/m.wav" }, { "sounds/m.wav": wavBytes(6) })],
    ["unreadable length", withSound({ mention: "sounds/m.wav" }, { "sounds/m.wav": new Uint8Array(200) })],
    ["missing file", withSound({ mention: "sounds/gone.wav" }, {})],
    ["not a sound", withSound({ mention: "sounds/m.png" }, { "sounds/m.png": new Uint8Array([1]) })],
  ])("rejects %s", (_n, bytes) => {
    expect(() => loadTheme(bytes)).toThrow(PackageError);
  });
});
