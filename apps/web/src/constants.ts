// Shared constants for the Wavvon desktop client.
//
// Pure values with no React or runtime dependencies. Anything that
// needs hooks or a render context belongs in a component file.
//
// EMOJI_CATALOG and QUICK_REACTIONS moved to @wavvon/ui (packages/ui/src/emojiCatalog.ts)
// so both apps share one catalog.

// No client-side attachment cap on web: nothing read this constant, and the
// hub is authoritative now that the limit is operator-configurable — its 413
// names the configured size. A hardcoded copy here would go stale the moment
// an operator changed it.

export const RECENT_EMOJI_KEY = "wavvon.recentEmojis";
export const RECENT_EMOJI_MAX = 8;

// Curated row shown above the Activities textarea in edit mode (wishlist:
// "Game icons in Activities", lazy v1) — not a full emoji picker, just quick
// inserts for the common case.
export const GAME_ACTIVITY_EMOJI: string[] = ["🎮", "🕹️", "⚔️", "🏹", "🏎️", "⚽", "🏀", "♟️", "🧩", "🎲", "🎯", "🃏"];

export const MIC_METER_MAX = 0.2;

// Build target. The hub build is what a hub serves from its own origin: one
// hub and its interconnections, no list — no switcher, no add-hub, no
// create-hub, no directory, no home-hub editor (decisions.md, "Two web
// clients: one per hub, one per user"). Set by `vite build --mode hub` via
// .env.hub; anything else is the user build.
//
// Compared against a literal so the bundler folds it: the dropped screens
// leave the bundle, they are not merely hidden. Never turn this into a
// runtime value — a `false` that is only known at runtime ships every screen
// it was meant to remove.
export const MULTI_HUB: boolean = import.meta.env.VITE_BUILD_TARGET !== "hub";

// Where the user build lives — the multi-hub client, hosted next to the
// directory. The hub build points people at it; the user build has no use for
// it. null means the invitation to move is not rendered at all: same rule as
// the directory below, don't ship a dead button.
//
// Only hub URL and invite code ever travel in that link. They are not secrets
// and the user can read them in the address bar. A seed never goes in a URL —
// that handover is a postMessage, see decisions.md 2026-08-25.
const USER_CLIENT_ORIGIN: string | null = null; // set once the hosted app has a domain

/** null in the user build too, structurally: you are already there. */
export const USER_CLIENT_URL: string | null = MULTI_HUB ? null : USER_CLIENT_ORIGIN;

// The public hub directory (discovery-v2.md). null means every surface that
// needs it — browse public hubs, the hub-creation wizard link, the skins
// gallery, the directory listing form in hub admin — is not rendered at all.
// Same rule as USER_CLIENT_URL above: don't ship a dead button.
//
// It was three different hardcoded hostnames across five files
// (discovery.wavvon.io, discovery.wavvon.app, hub-directory.wavvon.io), none
// of which resolves. That is what "the features that don't work because we
// don't have discovery yet" actually was.
//
// Gated through MULTI_HUB rather than read directly, so switching it on
// cannot accidentally light up a directory in the hub build.
const DIRECTORY_URL: string | null = null;

export const DISCOVERY_URL: string | null = MULTI_HUB ? DIRECTORY_URL : null;

// Small preset palette for role/role-category color pickers. Free hex input
// is offered alongside these for anything more specific.
export const ROLE_ACCENT_COLORS: string[] = [
  "#e74c3c",
  "#e67e22",
  "#f39c12",
  "#27ae60",
  "#16a085",
  "#2980b9",
  "#8e44ad",
  "#e91e63",
  "#7f8c8d",
];

export const EXPIRY_OPTIONS: { label: string; seconds: number | null }[] = [
  { label: "Never", seconds: null },
  { label: "30 minutes", seconds: 30 * 60 },
  { label: "1 hour", seconds: 60 * 60 },
  { label: "6 hours", seconds: 6 * 60 * 60 },
  { label: "1 day", seconds: 24 * 60 * 60 },
  { label: "7 days", seconds: 7 * 24 * 60 * 60 },
];

export const THEMES: {
  id: "calm" | "classic" | "linear" | "light";
  name: string;
  tagline: string;
  swatches: [string, string, string];
}[] = [
  {
    id: "calm",
    name: "Calm",
    tagline: "Warm dark, dusty teal. Soft on the eyes — fits everyone.",
    swatches: ["#1c1a1f", "#2c2a31", "#88b8a8"],
  },
  {
    id: "classic",
    name: "Classic",
    tagline: "Deep navy + violet purple. Familiar and tech-forward.",
    swatches: ["#1a1a2e", "#1e2a47", "#7c3aed"],
  },
  {
    id: "linear",
    name: "Linear",
    tagline: "Near-black with a sharp violet-blue accent. Minimal.",
    swatches: ["#0c0d11", "#1a1c22", "#6571f0"],
  },
  {
    id: "light",
    name: "Light",
    tagline: "Off-white with a dusty teal accent. Reads well in daylight.",
    swatches: ["#fafaf7", "#f5f4ef", "#4a8d7a"],
  },
];
