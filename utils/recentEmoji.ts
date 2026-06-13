const RECENT_EMOJI_KEY = "voxply.recentEmojis";
const RECENT_EMOJI_MAX = 8;

export function loadRecentEmojis(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_EMOJI_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_EMOJI_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecentEmoji(emoji: string) {
  try {
    const cur = loadRecentEmojis();
    const next = [emoji, ...cur.filter((e) => e !== emoji)].slice(
      0,
      RECENT_EMOJI_MAX,
    );
    localStorage.setItem(RECENT_EMOJI_KEY, JSON.stringify(next));
  } catch {
    // localStorage full / disabled → just no recents, no big deal
  }
}
