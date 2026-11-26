function hashToHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

function initialsFrom(name: string | null | undefined): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "?";
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

const AVATAR_TONES = 6;

/** Which of the palette tones a hub or person gets, for surfaces drawn in
 *  their colour (the hub card behind the sidebar header). */
export function avatarTone(seed: string): number {
  return hashToHue(seed) % AVATAR_TONES;
}

export function Avatar({
  src,
  name,
  pubkey,
  size = 24,
  self = false,
}: {
  src?: string | null;
  name: string | null | undefined;
  pubkey?: string | null;
  size?: number;
  /** Your own avatar: the one tile drawn in the accent. */
  self?: boolean;
}) {
  // Corners scale with the tile, so a 22px tab icon and a 48px header avatar
  // read as the same shape.
  const radius = Math.round(size * 0.28);
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="avatar-img"
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }
  const initials = initialsFrom(name);
  // A fixed palette, picked by hash: the theme owns the colours, the hash
  // only decides which one a person gets.
  const tone = self ? "self" : String(avatarTone(pubkey || name || "?"));
  return (
    <span
      className={`avatar-fallback avatar-tone-${tone}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: Math.round(size * (size < 30 ? 0.41 : 0.34)),
      }}
    >
      {initials}
    </span>
  );
}
