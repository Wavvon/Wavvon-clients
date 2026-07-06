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

export function Avatar({
  src,
  name,
  pubkey,
  size = 24,
}: {
  src?: string | null;
  name: string | null | undefined;
  pubkey?: string | null;
  size?: number;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="avatar-img"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = initialsFrom(name);
  const hue = hashToHue(pubkey || name || "?");
  return (
    <span
      className="avatar-fallback"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.45),
        background: `hsl(${hue}, 55%, 42%)`,
        color: "#fff",
      }}
    >
      {initials}
    </span>
  );
}
