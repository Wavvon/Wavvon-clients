// Wire format helpers — match Rust's write_u32_le / write_u64_le / write_str /
// write_str_vec in desktop/src-tauri/src/identity.rs.

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function writeU32LE(n: number): Uint8Array {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, n >>> 0, true);
  return buf;
}

function writeU64LE(n: number): Uint8Array {
  const buf = new Uint8Array(8);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, n >>> 0, true);
  dv.setUint32(4, Math.floor(n / 0x100000000) >>> 0, true);
  return buf;
}

function writeStr(s: string): Uint8Array {
  const enc = new TextEncoder().encode(s);
  return concat(writeU32LE(enc.length), enc);
}

function writeStrVec(v: string[]): Uint8Array {
  const parts: Uint8Array[] = [writeU32LE(v.length)];
  for (const s of v) parts.push(writeStr(s));
  return concat(...parts);
}

export function offerSigningBytes(
  masterPubkey: string,
  homeHubs: string[],
  pairingToken: string,
  issuedAt: number,
  expiresAt: number,
): Uint8Array {
  return concat(
    new TextEncoder().encode("voxply/pairing-offer/v1\0"),
    writeStr(masterPubkey),
    writeStrVec(homeHubs),
    writeStr(pairingToken),
    writeU64LE(issuedAt),
    writeU64LE(expiresAt),
  );
}

export function subkeyCertSigningBytes(
  masterPubkey: string,
  subkeyPubkey: string,
  deviceLabel: string,
  issuedAt: number,
  notAfter: number | null,
  fallbackHubs: string[],
): Uint8Array {
  const optNotAfter =
    notAfter === null
      ? new Uint8Array([0])
      : concat(new Uint8Array([1]), writeU64LE(notAfter));
  return concat(
    new TextEncoder().encode("voxply/subkey-cert/v1\0"),
    writeStr(masterPubkey),
    writeStr(subkeyPubkey),
    writeStr(deviceLabel),
    writeU64LE(issuedAt),
    optNotAfter,
    writeStrVec(fallbackHubs),
  );
}

export function claimSigningBytes(
  pairingToken: string,
  subkeyPubkey: string,
  deviceLabel: string,
): Uint8Array {
  return concat(
    new TextEncoder().encode("voxply/pairing-claim/v1\0"),
    writeStr(pairingToken),
    writeStr(subkeyPubkey),
    writeStr(deviceLabel),
  );
}
