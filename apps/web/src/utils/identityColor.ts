// A Wavvon identity IS an Ed25519 public key, so its profile banner is
// colored from that key: same key → same colors, everywhere, forever. Two
// hues are hashed out of the hex and rendered as a diagonal gradient tuned
// (moderate saturation, mid lightness) to sit well on both dark and light
// themes. Pure and deterministic — no randomness, no storage.
export function identityGradient(pubkeyHex: string | null | undefined): string {
  const key = pubkeyHex ?? "";
  let h1 = 7;
  let h2 = 101;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    h1 = (h1 * 31 + c) % 360;
    h2 = (h2 * 17 + c * 7 + 13) % 360;
  }
  // Keep the two hues visibly apart so the gradient always has movement.
  if (Math.abs(h1 - h2) < 40) h2 = (h2 + 90) % 360;
  return `linear-gradient(120deg, hsl(${h1} 58% 46%), hsl(${h2} 52% 38%))`;
}
