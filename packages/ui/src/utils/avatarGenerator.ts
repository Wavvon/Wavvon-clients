// Deterministic, fully offline default-avatar generator. Every avatar is an
// inline SVG built from a hash of a text seed — no network calls, no bundled
// image assets. The same seed always reproduces the exact same avatar, so a
// generated avatar can be re-derived from its seed if needed, but callers
// should treat the returned data URL as the value to store (same shape as an
// uploaded-image avatar).

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32: small, fast, deterministic PRNG seeded from the hash above so
// each seed yields a reproducible sequence of pseudo-random draws.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Palette {
  bg: string;
  fg: string;
  accent: string;
}

const PALETTES: Palette[] = [
  { bg: "#FDE68A", fg: "#92400E", accent: "#F59E0B" },
  { bg: "#BFDBFE", fg: "#1E3A8A", accent: "#3B82F6" },
  { bg: "#FBCFE8", fg: "#9D174D", accent: "#EC4899" },
  { bg: "#BBF7D0", fg: "#14532D", accent: "#22C55E" },
  { bg: "#DDD6FE", fg: "#4C1D95", accent: "#8B5CF6" },
  { bg: "#FED7AA", fg: "#7C2D12", accent: "#F97316" },
  { bg: "#99F6E4", fg: "#134E4A", accent: "#14B8A6" },
  { bg: "#FECACA", fg: "#7F1D1D", accent: "#EF4444" },
  { bg: "#E9D5FF", fg: "#581C87", accent: "#A855F7" },
  { bg: "#FEF08A", fg: "#713F12", accent: "#EAB308" },
];

const VARIANTS = ["blob", "robot", "geo"] as const;
type Variant = (typeof VARIANTS)[number];

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

function range(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

function buildBlobPath(rng: () => number): string {
  const points = 8;
  const cx = 50;
  const cy = 50;
  const baseRadius = 30;
  const coords: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const angle = (Math.PI * 2 * i) / points;
    const r = baseRadius + range(rng, -8, 8);
    coords.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
  }
  let d = `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)} `;
  for (let i = 0; i < points; i++) {
    const [x0, y0] = coords[i];
    const [x1, y1] = coords[(i + 1) % points];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    d += `Q ${x0.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)} `;
  }
  return `${d}Z`;
}

function buildBlob(rng: () => number, p: Palette): string {
  const path = buildBlobPath(rng);
  const eyeDx = range(rng, 6, 10);
  const eyeY = range(rng, 44, 50);
  const eyeR = range(rng, 2.5, 4);
  const smile = rng() > 0.5;
  return `
    <path d="${path}" fill="${p.accent}" />
    <circle cx="${(50 - eyeDx).toFixed(1)}" cy="${eyeY.toFixed(1)}" r="${eyeR.toFixed(1)}" fill="${p.fg}" />
    <circle cx="${(50 + eyeDx).toFixed(1)}" cy="${eyeY.toFixed(1)}" r="${eyeR.toFixed(1)}" fill="${p.fg}" />
    ${
      smile
        ? `<path d="M 42 60 Q 50 68 58 60" stroke="${p.fg}" stroke-width="2.5" fill="none" stroke-linecap="round" />`
        : `<circle cx="50" cy="61" r="3" fill="${p.fg}" />`
    }
  `;
}

function buildRobot(rng: () => number, p: Palette): string {
  const headW = range(rng, 46, 56);
  const headX = (100 - headW) / 2;
  const headY = range(rng, 26, 32);
  const headH = 100 - headY - 20;
  const roundEyes = rng() > 0.5;
  const eyeDx = headW / 4;
  const eyeY = headY + headH * 0.4;
  const hasAntenna = rng() > 0.3;
  const mouthTeeth = rng() > 0.5;

  const eyes = roundEyes
    ? (() => {
        const r = range(rng, 3.5, 5.5);
        return `
          <circle cx="${(50 - eyeDx).toFixed(1)}" cy="${eyeY.toFixed(1)}" r="${r.toFixed(1)}" fill="${p.fg}" />
          <circle cx="${(50 + eyeDx).toFixed(1)}" cy="${eyeY.toFixed(1)}" r="${r.toFixed(1)}" fill="${p.fg}" />
        `;
      })()
    : (() => {
        const w = range(rng, 6, 9);
        const h = range(rng, 4, 6);
        return `
          <rect x="${(50 - eyeDx - w / 2).toFixed(1)}" y="${(eyeY - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${p.fg}" />
          <rect x="${(50 + eyeDx - w / 2).toFixed(1)}" y="${(eyeY - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${p.fg}" />
        `;
      })();

  const mouthY = headY + headH * 0.72;
  const mouth = mouthTeeth
    ? `<rect x="40" y="${(mouthY - 2).toFixed(1)}" width="20" height="4" fill="${p.fg}" />
       <line x1="45" y1="${(mouthY - 2).toFixed(1)}" x2="45" y2="${(mouthY + 2).toFixed(1)}" stroke="${p.bg}" stroke-width="1" />
       <line x1="50" y1="${(mouthY - 2).toFixed(1)}" x2="50" y2="${(mouthY + 2).toFixed(1)}" stroke="${p.bg}" stroke-width="1" />
       <line x1="55" y1="${(mouthY - 2).toFixed(1)}" x2="55" y2="${(mouthY + 2).toFixed(1)}" stroke="${p.bg}" stroke-width="1" />`
    : `<rect x="42" y="${(mouthY - 1.5).toFixed(1)}" width="16" height="3" rx="1.5" fill="${p.fg}" />`;

  const antenna = hasAntenna
    ? `<line x1="50" y1="${headY.toFixed(1)}" x2="50" y2="${(headY - 8).toFixed(1)}" stroke="${p.accent}" stroke-width="2.5" />
       <circle cx="50" cy="${(headY - 10).toFixed(1)}" r="3" fill="${p.accent}" />`
    : "";

  return `
    ${antenna}
    <rect x="${headX.toFixed(1)}" y="${headY.toFixed(1)}" width="${headW.toFixed(1)}" height="${headH.toFixed(1)}" rx="10" fill="${p.accent}" />
    <circle cx="${(headX - 2).toFixed(1)}" cy="${(headY + headH / 2).toFixed(1)}" r="3.5" fill="${p.accent}" />
    <circle cx="${(headX + headW + 2).toFixed(1)}" cy="${(headY + headH / 2).toFixed(1)}" r="3.5" fill="${p.accent}" />
    ${eyes}
    ${mouth}
  `;
}

function buildGeo(rng: () => number, p: Palette): string {
  const shapes: string[] = [];
  const count = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i++) {
    const kind = pick(rng, ["triangle", "rect", "circle"] as const);
    const cx = range(rng, 25, 75);
    const cy = range(rng, 25, 75);
    const size = range(rng, 14, 28);
    const rotate = range(rng, 0, 360);
    const color = rng() > 0.5 ? p.fg : p.accent;
    const opacity = range(rng, 0.75, 1);
    if (kind === "circle") {
      shapes.push(
        `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(size / 2).toFixed(1)}" fill="${color}" opacity="${opacity.toFixed(2)}" />`
      );
    } else if (kind === "rect") {
      shapes.push(
        `<rect x="${(cx - size / 2).toFixed(1)}" y="${(cy - size / 2).toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}" fill="${color}" opacity="${opacity.toFixed(2)}" transform="rotate(${rotate.toFixed(0)} ${cx.toFixed(1)} ${cy.toFixed(1)})" />`
      );
    } else {
      const h = size * 0.87;
      shapes.push(
        `<polygon points="${cx.toFixed(1)},${(cy - h / 2).toFixed(1)} ${(cx - size / 2).toFixed(1)},${(cy + h / 2).toFixed(1)} ${(cx + size / 2).toFixed(1)},${(cy + h / 2).toFixed(1)}" fill="${color}" opacity="${opacity.toFixed(2)}" transform="rotate(${rotate.toFixed(0)} ${cx.toFixed(1)} ${cy.toFixed(1)})" />`
      );
    }
  }
  return shapes.join("\n");
}

export function generateAvatarSvg(seed: string): string {
  const rng = mulberry32(hashSeed(seed));
  const palette = pick(rng, PALETTES);
  const variant: Variant = pick(rng, VARIANTS);
  const inner =
    variant === "blob" ? buildBlob(rng, palette) : variant === "robot" ? buildRobot(rng, palette) : buildGeo(rng, palette);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" fill="${palette.bg}" />${inner}</svg>`;
}

export function generateAvatarDataUrl(seed: string): string {
  const svg = generateAvatarSvg(seed);
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export function randomAvatarSeed(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
