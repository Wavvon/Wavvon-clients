import { extensionOf } from "./packageFormat";

// Header-only length of a theme sound, so a package is checked against the
// 5 s limit without decoding audio (the loader also runs where there is no
// AudioContext). Null means the length could not be read, which rejects the
// file.

function wav(b: Uint8Array): number | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.byteLength < 44 || v.getUint32(0) !== 0x52494646 || v.getUint32(8) !== 0x57415645) return null;
  let byteRate = 0;
  for (let p = 12; p + 8 <= b.byteLength; ) {
    const id = v.getUint32(p);
    const size = v.getUint32(p + 4, true);
    if (id === 0x666d7420 && p + 20 <= b.byteLength) byteRate = v.getUint32(p + 16, true);
    if (id === 0x64617461) return byteRate > 0 ? Math.min(size, b.byteLength - p - 8) / byteRate : null;
    p += 8 + size + (size % 2);
  }
  return null;
}

function ogg(b: Uint8Array): number | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const head = (at: number, s: string) => [...s].every((c, i) => b[at + i] === c.charCodeAt(0));
  if (b.byteLength < 64 || !head(0, "OggS")) return null;
  const segs = b[26];
  const first = 27 + segs;
  let rate: number;
  let skip = 0;
  if (head(first, "OpusHead")) {
    rate = 48000;
    skip = v.getUint16(first + 10, true);
  } else if (head(first + 1, "vorbis")) {
    rate = v.getUint32(first + 12, true);
  } else {
    return null;
  }
  let last = -1;
  for (let i = b.byteLength - 14; i >= 0; i--) {
    if (head(i, "OggS")) {
      last = i;
      break;
    }
  }
  if (last < 0 || rate <= 0) return null;
  const granule = Number(v.getBigUint64(last + 6, true));
  return granule > 0 ? Math.max(0, granule - skip) / rate : null;
}

const MP3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];

// Constant-bitrate estimate from the first frame: a variable-bitrate file
// can be longer than this says. ponytail: read the Xing/VBRI header when a
// real VBR theme sound turns up.
function mp3(b: Uint8Array): number | null {
  let p = 0;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) p = 10 + (((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f));
  for (; p + 4 < b.byteLength; p++) {
    if (b[p] === 0xff && (b[p + 1] & 0xe0) === 0xe0) {
      const layer = (b[p + 1] >> 1) & 3;
      const version = (b[p + 1] >> 3) & 3;
      const idx = b[p + 2] >> 4;
      if (layer !== 1 || version !== 3 || idx === 0 || idx > 14) continue;
      return ((b.byteLength - p) * 8) / (MP3_BITRATES[idx] * 1000);
    }
  }
  return null;
}

export function audioDurationSeconds(bytes: Uint8Array, path: string): number | null {
  switch (extensionOf(path)) {
    case "wav": return wav(bytes);
    case "ogg": return ogg(bytes);
    case "mp3": return mp3(bytes);
    default: return null;
  }
}

export const MAX_SOUND_SECONDS = 5;
