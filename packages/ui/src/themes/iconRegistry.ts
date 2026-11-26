// The closed set of icon names a theme can replace (themes.md section 1).
// Every icon in Icons.tsx goes through one of these; names outside the set
// are ignored by the loader.

const CHANNEL_GLYPHS = [
  "chat", "mic", "headphones", "speaker", "video", "music", "game", "film", "book", "star",
  "heart", "shield", "crown", "lock", "key", "bolt", "home", "globe", "info", "warning",
  "person", "group", "trophy", "rocket", "tools", "megaphone", "news",
];

export const ICON_NAMES: readonly string[] = [
  "phone-off", "mic", "mic-off", "deafen", "screen-share", "camera", "camera-off",
  "pin", "search", "members", "link", "flag", "reply", "edit", "trash", "settings",
  "plus", "close", "chevron", "expand", "fullscreen", "reset", "forum", "bell-off", "lock",
  "paperclip", "speaker", "clock", "whisper", "cake", "calendar", "wave",
  "reaction-add", "messages", "discover", "mention", "bookmark", "menu",
  "channel-text", "channel-voice", "channel-forum", "channel-spawner",
  ...CHANNEL_GLYPHS.map((g) => `channel-${g}`),
];

const KNOWN = new Set(ICON_NAMES);

export function isIconName(name: string): boolean {
  return KNOWN.has(name);
}

/** Icons that show a state when off: the theme replaces the glyph, the client
 *  keeps drawing the "off" treatment over it. */
export const OFF_STATE_ICONS: readonly string[] = ["mic-off", "camera-off", "bell-off"];
