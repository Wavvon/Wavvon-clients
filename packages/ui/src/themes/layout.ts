// The closed layout options a theme can set (themes.md section 1). Add a key
// or value here and in themes.md; an older client ignores what it does not
// know, so a newer theme still loads.

export const LAYOUT_OPTIONS = {
  member_list: ["right", "left", "hidden"],
  channel_list: ["tree", "compact"],
  tabs: ["top", "side"],
  density: ["cozy", "compact"],
  avatar_shape: ["square", "circle"],
} as const;

export type LayoutKey = keyof typeof LAYOUT_OPTIONS;
export type LayoutChoice = Partial<Record<LayoutKey, string>>;

export const LAYOUT_KEYS = Object.keys(LAYOUT_OPTIONS) as LayoutKey[];

export const LAYOUT_DEFAULTS: Record<LayoutKey, string> = {
  member_list: "right",
  channel_list: "tree",
  tabs: "top",
  density: "cozy",
  avatar_shape: "square",
};

/** Unknown keys and values are dropped, which means "the default". */
export function normalizeLayout(raw: unknown): LayoutChoice {
  const out: LayoutChoice = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  for (const key of LAYOUT_KEYS) {
    const v = r[key];
    if (typeof v === "string" && (LAYOUT_OPTIONS[key] as readonly string[]).includes(v)) out[key] = v;
  }
  return out;
}

/** The user's own choice beats the theme's, which beats the built-in default. */
export function resolveLayout(theme: LayoutChoice | undefined, user: LayoutChoice | undefined): Record<LayoutKey, string> {
  return { ...LAYOUT_DEFAULTS, ...theme, ...user };
}

const attr = (key: LayoutKey) => `layout${key.replace(/(^|_)([a-z])/g, (_m, _u, c: string) => c.toUpperCase())}`;

export function applyLayout(layout: Record<LayoutKey, string>): void {
  const el = document.documentElement;
  for (const key of LAYOUT_KEYS) el.dataset[attr(key)] = layout[key];
}
