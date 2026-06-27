export type SkinBase = "calm" | "classic" | "linear" | "light";
export type ThemeId = SkinBase | "custom";

export interface WavvonSkin {
  format: "wavvon.skin";
  version: 1;
  name: string;
  author_pubkey?: string;
  base: SkinBase;
  tokens: Record<string, string>;
}

export interface AppearanceState {
  slot: ThemeId;
  skin: WavvonSkin | null;
}

export const SKINNABLE_TOKENS: {
  group: string;
  tokens: { name: string; label: string; type: "color" | "color-alpha" | "shadow" | "radius" }[];
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

const ALL_ALLOWED = new Set(
  SKINNABLE_TOKENS.flatMap((g) => g.tokens.map((t) => t.name))
);

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
  return /^[\d\s.px%a-zA-Z,()#\-]+$/.test(v);
}

export function validateSkin(raw: unknown): WavvonSkin {
  if (typeof raw !== "object" || raw === null) throw new Error("Not an object");
  const s = raw as Record<string, unknown>;
  if (s.format !== "wavvon.skin") throw new Error("Invalid format field");
  if (s.version !== 1) throw new Error("Unsupported version");
  if (typeof s.name !== "string" || s.name.trim() === "" || s.name.length > 48)
    throw new Error("Invalid name (must be 1–48 characters)");
  const BASES = ["calm", "classic", "linear", "light"] as const;
  if (!BASES.includes(s.base as never)) throw new Error("Invalid base theme");
  if (typeof s.tokens !== "object" || s.tokens === null) throw new Error("Invalid tokens field");

  const tokens: Record<string, string> = {};
  for (const [k, v] of Object.entries(s.tokens as Record<string, unknown>)) {
    if (!ALL_ALLOWED.has(k)) continue;
    if (typeof v !== "string") throw new Error(`Token ${k}: expected string value`);
    if (hasForbidden(v)) throw new Error(`Token ${k}: contains forbidden content`);
    if (k === "--skin-radius-scale") {
      if (!isValidRadiusScale(v)) throw new Error(`Token ${k}: must be a number 0.5–2`);
    } else if (k.startsWith("--shadow-")) {
      if (!isValidShadow(v)) throw new Error(`Token ${k}: invalid shadow value`);
    } else {
      if (!isValidColor(v)) throw new Error(`Token ${k}: invalid color value`);
    }
    tokens[k] = v;
  }

  return {
    format: "wavvon.skin",
    version: 1,
    name: s.name.trim(),
    ...(typeof s.author_pubkey === "string" ? { author_pubkey: s.author_pubkey } : {}),
    base: s.base as SkinBase,
    tokens,
  };
}

export function applySkinTokens(skin: WavvonSkin): void {
  const el = document.documentElement;
  for (const [k, v] of Object.entries(skin.tokens)) {
    el.style.setProperty(k, v);
  }
}

export function clearSkinTokens(): void {
  const el = document.documentElement;
  ALL_ALLOWED.forEach((k) => el.style.removeProperty(k));
}

export function downloadSkin(skin: WavvonSkin): void {
  const json = JSON.stringify(skin, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${skin.name.replace(/[^a-zA-Z0-9\-_]/g, "_")}.wavvonskin`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseSkinFromRgba(hex6: string, alpha: number): string {
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
