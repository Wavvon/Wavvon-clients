export type ThemeTokenType = "color" | "color-alpha" | "shadow" | "radius";

export const THEME_TOKENS: {
  group: string;
  tokens: { name: string; label: string; type: ThemeTokenType }[];
}[] = [
  {
    group: "Surfaces",
    tokens: [
      { name: "--bg", label: "Background", type: "color" },
      { name: "--bg-elevated", label: "Elevated", type: "color" },
      { name: "--bg-sunken", label: "Sunken", type: "color" },
      { name: "--surface", label: "Surface", type: "color" },
      { name: "--surface-hover", label: "Surface hover", type: "color" },
    ],
  },
  {
    group: "Text",
    tokens: [
      { name: "--text", label: "Primary", type: "color" },
      { name: "--text-muted", label: "Muted", type: "color" },
      { name: "--text-faint", label: "Faint", type: "color" },
    ],
  },
  {
    group: "Accent",
    tokens: [
      { name: "--accent", label: "Accent", type: "color" },
      { name: "--accent-hover", label: "Accent hover", type: "color" },
      { name: "--accent-text", label: "Accent text", type: "color" },
    ],
  },
  {
    group: "Status",
    tokens: [
      { name: "--info", label: "Info", type: "color" },
      { name: "--info-hover", label: "Info hover", type: "color" },
      { name: "--success", label: "Success", type: "color" },
      { name: "--warning", label: "Warning", type: "color" },
      { name: "--danger", label: "Danger", type: "color" },
      { name: "--danger-hover", label: "Danger hover", type: "color" },
      { name: "--danger-bg", label: "Danger background", type: "color" },
    ],
  },
  {
    group: "Border & Effects",
    tokens: [
      { name: "--border", label: "Border", type: "color" },
      { name: "--ring", label: "Focus ring", type: "color-alpha" },
      { name: "--overlay", label: "Overlay", type: "color-alpha" },
    ],
  },
  {
    group: "Shadows",
    tokens: [
      { name: "--shadow-sm", label: "Small", type: "shadow" },
      { name: "--shadow-md", label: "Medium", type: "shadow" },
      { name: "--shadow-lg", label: "Large", type: "shadow" },
    ],
  },
  {
    group: "Radius",
    tokens: [{ name: "--skin-radius-scale", label: "Border radius scale", type: "radius" }],
  },
];

const TOKEN_TYPES = new Map(THEME_TOKENS.flatMap((g) => g.tokens.map((t) => [t.name, t.type] as const)));

export const ALL_TOKEN_NAMES = [...TOKEN_TYPES.keys()];

export function tokenType(name: string): ThemeTokenType | undefined {
  return TOKEN_TYPES.get(name);
}

const FORBIDDEN = ["url(", "var(", "@", "expression", "/*", ";", "}", "<"];

function hasForbidden(v: string): boolean {
  return FORBIDDEN.some((f) => v.includes(f));
}

function isValidColor(v: string): boolean {
  if (hasForbidden(v)) return false;
  return (
    /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v) ||
    /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(\s*,\s*[\d.]+)?\s*\)$/.test(v) ||
    /^hsla?\(\s*\d+\s*,\s*[\d.]+%\s*,\s*[\d.]+%(\s*,\s*[\d.]+)?\s*\)$/.test(v)
  );
}

function isValidRadiusScale(v: string): boolean {
  if (hasForbidden(v)) return false;
  const n = parseFloat(v);
  return /^\d*\.?\d+$/.test(v.trim()) && n >= 0.5 && n <= 2;
}

function isValidShadow(v: string): boolean {
  if (hasForbidden(v)) return false;
  return /^[\d\s.px%a-zA-Z,()#-]+$/.test(v);
}

/** Unknown token names are ignored (newer themes load on older clients); a
 *  known token with a bad value rejects the package. */
export function validateTokenMap(raw: unknown, where: string): Record<string, string> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`colors.${where} must be an object`);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const type = TOKEN_TYPES.get(k);
    if (!type) continue;
    if (typeof v !== "string") throw new Error(`colors.${where} ${k}: expected string value`);
    if (hasForbidden(v)) throw new Error(`colors.${where} ${k}: contains forbidden content`);
    const ok = type === "radius" ? isValidRadiusScale(v) : type === "shadow" ? isValidShadow(v) : isValidColor(v);
    if (!ok) throw new Error(`colors.${where} ${k}: invalid ${type === "radius" ? "radius scale (0.5 to 2)" : type} value`);
    out[k] = v;
  }
  return out;
}

export function composeRgba(hex6: string, alpha: number): string {
  const r = parseInt(hex6.slice(1, 3), 16);
  const g = parseInt(hex6.slice(3, 5), 16);
  const b = parseInt(hex6.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

export function splitRgba(v: string): { hex: string; alpha: number } {
  const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (m) {
    const hex = `#${[m[1], m[2], m[3]].map((n) => parseInt(n).toString(16).padStart(2, "0")).join("")}`;
    return { hex, alpha: m[4] !== undefined ? parseFloat(m[4]) : 1 };
  }
  return { hex: v.startsWith("#") ? v.slice(0, 7) : "#000000", alpha: 1 };
}
