function parseColor(v: string): [number, number, number] | null {
  const hex = v.trim().match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length < 6) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(fg: string, bg: string): number | null {
  const a = parseColor(fg);
  const b = parseColor(bg);
  if (!a || !b) return null;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const WCAG_AA = 4.5;

const TEXT_TOKENS = ["--text", "--text-muted", "--accent-text"] as const;
const SURFACE_TOKENS = ["--bg", "--surface", "--bg-elevated"] as const;

export interface ContrastWarning {
  text: string;
  surface: string;
  ratio: number;
}

/** Text tokens against the surfaces they are drawn on; `--accent-text` sits
 *  on `--accent`. `resolve` supplies the effective value (theme or built-in). */
export function contrastWarnings(resolve: (token: string) => string): ContrastWarning[] {
  const out: ContrastWarning[] = [];
  for (const text of TEXT_TOKENS) {
    const surfaces = text === "--accent-text" ? ["--accent"] : SURFACE_TOKENS;
    for (const surface of surfaces) {
      const ratio = contrastRatio(resolve(text), resolve(surface));
      if (ratio !== null && ratio < WCAG_AA) out.push({ text, surface, ratio });
    }
  }
  return out;
}
