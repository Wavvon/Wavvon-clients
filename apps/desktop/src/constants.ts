// Shared constants for the Wavvon desktop client.
//
// Pure values with no React or runtime dependencies. Anything that
// needs hooks or a render context belongs in a component file.
//
// EMOJI_CATALOG and QUICK_REACTIONS moved to @wavvon/ui (packages/ui/src/emojiCatalog.ts)
// so both apps share one catalog.

// A pre-flight ceiling, not the hub's limit. The per-message cap is
// operator-configurable (hub_settings max_attachment_bytes, advertised on
// /info) and the hub is authoritative: its 413 names the real number. This
// exists only so the client does not upload something no hub could accept, so
// it matches the hub's hard ceiling rather than its default — a copy of the
// default would refuse files an operator had deliberately allowed.
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

// The public hub directory (discovery-v2.md). null means the surfaces that
// need it are not rendered — same rule the web client uses. The desktop hub
// browser used to point at hub-directory.wavvon.io, which does not resolve.
export const DISCOVERY_URL: string | null = null;

export const MIC_METER_MAX = 0.2;

export const EXPIRY_OPTIONS: { label: string; seconds: number | null }[] = [
  { label: "Never", seconds: null },
  { label: "30 minutes", seconds: 30 * 60 },
  { label: "1 hour", seconds: 60 * 60 },
  { label: "6 hours", seconds: 6 * 60 * 60 },
  { label: "1 day", seconds: 24 * 60 * 60 },
  { label: "7 days", seconds: 7 * 24 * 60 * 60 },
];

// Name and tagline live in the catalogs, looked up as
// `settings.skin.base.<id>` and `settings.theme.tagline.<id>` — a module-level
// English label map is exactly what kept the picker English while every
// catalog reported full coverage.
export const THEMES: {
  id: "dark" | "light" | "custom";
  swatches: [string, string, string];
}[] = [
  { id: "dark", swatches: ["#12141a", "#181b23", "#e8b33c"] },
  { id: "light", swatches: ["#f6f6f3", "#fffffe", "#a9741a"] },
  { id: "custom", swatches: ["#888888", "#aaaaaa", "#cccccc"] },
];
