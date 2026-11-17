import { parseColor } from "./contrast";
import type { ThemeBackground } from "./theme";

// The panels' own tokens become translucent so the image shows through.
const PANEL_TOKENS = ["--bg", "--bg-elevated", "--bg-sunken", "--surface", "--surface-hover"];

export const BG_FITS = ["cover", "contain", "tile", "center"] as const;
export type BackgroundFit = (typeof BG_FITS)[number];

export const DEFAULT_BACKGROUND = { fit: "cover", dim: 0.45, panel_opacity: 0.85, blur: 0 } as const;

const clamp = (n: unknown, lo: number, hi: number, fallback: number): number =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;

/** Out-of-range numbers are pulled into range and an unknown fit falls back:
 *  a theme made for a newer client still loads. */
export function normalizeBackground(raw: Record<string, unknown>, image: string): ThemeBackground {
  const fit = BG_FITS.includes(raw.fit as BackgroundFit) ? (raw.fit as BackgroundFit) : DEFAULT_BACKGROUND.fit;
  return {
    image,
    fit,
    dim: clamp(raw.dim, 0, 0.9, DEFAULT_BACKGROUND.dim),
    panel_opacity: clamp(raw.panel_opacity, 0.6, 1, DEFAULT_BACKGROUND.panel_opacity),
    blur: clamp(raw.blur, 0, 20, DEFAULT_BACKGROUND.blur),
  };
}

export function translucent(color: string, opacity: number): string | null {
  const rgb = parseColor(color);
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})` : null;
}

export interface BackgroundOptions {
  url: string;
  reduceTransparency: boolean;
  blurOff: boolean;
  /** The colour a token has with the theme applied. */
  resolve: (token: string) => string;
}

const LAYER_ID = "theme-bg";

// Panel tokens are not touched here: applyThemeTokens clears and re-sets them.
export function clearBackground(): void {
  const el = document.documentElement;
  document.getElementById(LAYER_ID)?.remove();
  delete el.dataset.themeBg;
}

// Call after the theme's colour tokens are applied: the translucent panel
// values replace them.
export function applyBackground(bg: ThemeBackground, opts: BackgroundOptions): void {
  clearBackground();
  const html = document.documentElement;
  let layer = document.getElementById(LAYER_ID);
  if (!layer) {
    layer = document.createElement("div");
    layer.id = LAYER_ID;
    layer.className = "theme-bg";
    layer.setAttribute("aria-hidden", "true");
    document.body.prepend(layer);
  }
  const veil = `rgba(0, 0, 0, ${bg.dim})`;
  layer.style.backgroundColor = opts.resolve("--bg");
  layer.style.backgroundImage = `linear-gradient(${veil}, ${veil}), url("${opts.url}")`;
  layer.style.backgroundSize = `auto, ${bg.fit === "cover" || bg.fit === "contain" ? bg.fit : "auto"}`;
  layer.style.backgroundRepeat = bg.fit === "tile" ? "repeat" : "no-repeat";
  const blur = opts.reduceTransparency || opts.blurOff ? 0 : bg.blur;
  layer.style.filter = blur ? `blur(${blur}px)` : "";
  layer.style.inset = blur ? `-${blur * 2}px` : "";
  html.dataset.themeBg = "1";
  if (opts.reduceTransparency) return;
  for (const tok of PANEL_TOKENS) {
    const c = translucent(opts.resolve(tok), bg.panel_opacity);
    if (c) html.style.setProperty(tok, c);
  }
}
