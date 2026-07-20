// Shared constants for the Wavvon desktop client.
//
// Pure values with no React or runtime dependencies. Anything that
// needs hooks or a render context belongs in a component file.
//
// EMOJI_CATALOG and QUICK_REACTIONS moved to @wavvon/ui (packages/ui/src/emojiCatalog.ts)
// so both apps share one catalog.

export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024; // matches the hub cap

export const MIC_METER_MAX = 0.2;

export const ALL_PERMISSIONS: { id: string; label: string }[] = [
  { id: "admin", label: "Administrator (grants everything)" },
  { id: "manage_channels", label: "Manage channels" },
  { id: "manage_roles", label: "Manage roles" },
  { id: "manage_messages", label: "Manage messages" },
  { id: "kick_members", label: "Kick members" },
  { id: "ban_members", label: "Ban members" },
  { id: "mute_members", label: "Mute members" },
  { id: "timeout_members", label: "Timeout members" },
  { id: "manage_hub_icons", label: "Manage hub icon library (upload / rename / delete)" },
  { id: "manage_channel_icons", label: "Set icons and colors on channels" },
  { id: "manage_bots", label: "Manage bots (create / delete / rotate token)" },
  { id: "read_messages", label: "Read messages" },
  { id: "send_messages", label: "Send messages" },
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
  id: "calm" | "classic" | "linear" | "light" | "custom";
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
  {
    id: "custom",
    name: "Custom",
    tagline: "Your own skin. Edit tokens below after selecting this slot.",
    swatches: ["#888888", "#aaaaaa", "#cccccc"],
  },
];
