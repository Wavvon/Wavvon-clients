// Made-up content for the preview capture. Nothing here comes from a real
// hub or a real person, so a preview can be shared safely.

export const DEMO_HUB = { name: "Sunset Hub", host: "sunset.example" };

export const DEMO_CHANNELS = [
  { name: "general", type: "text", selected: true },
  { name: "music", type: "text", selected: false },
  { name: "screenshots", type: "text", selected: false },
  { name: "Lounge", type: "voice", selected: false },
];

export const DEMO_MEMBERS = [
  { name: "Alice", status: "Online", key: "demo-alice" },
  { name: "Bram", status: "Listening to lo-fi", key: "demo-bram" },
  { name: "Chiara", status: "Online", key: "demo-chiara" },
];

export const DEMO_MESSAGES = [
  { author: "Alice", key: "demo-alice", time: "10:02", text: "Anyone up for a game later?" },
  { author: "Bram", key: "demo-bram", time: "10:04", text: "Count me in. I will bring the playlist." },
  { author: "Chiara", key: "demo-chiara", time: "10:05", text: "Same, give me ten minutes." },
];

export const PREVIEW_WIDTH = 960;
export const PREVIEW_HEIGHT = 540;
