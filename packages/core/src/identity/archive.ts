import { argon2idAsync } from "@noble/hashes/argon2";
import { gcm } from "@noble/ciphers/aes";

// The `wavvon-archive` envelope around the full personal-data archive
// (docs/data-export.md §0). Same KDF and cipher as `.wavvon-backup`, but a
// distinct self-describing shape: `format` is what tells an archive apart
// from an identity backup on import. Desktop's Rust side (archive.rs)
// implements it byte-for-byte; ARCHIVE_TEST_VECTOR in archive.test.ts is the
// shared fixture both sides assert against.

export const ARCHIVE_FORMAT = "wavvon-archive" as const;
export const ARCHIVE_ENVELOPE_VERSION = 1;
export const ARCHIVE_FILE_EXTENSION = ".json.enc";

const ARCHIVE_KDF_PARAMS = { m: 65536, t: 3, p: 1 } as const;

export interface ArchiveEnvelope {
  format: typeof ARCHIVE_FORMAT;
  version: number;
  kdf: { alg: "argon2id"; m: number; t: number; p: number; salt: string };
  cipher: { alg: "aes-256-gcm"; nonce: string };
  ciphertext: string;
}

/** Injected for the deterministic test vector; production callers omit it. */
export interface ArchiveSaltNonceOverride {
  salt: Uint8Array;
  nonce: Uint8Array;
}

export async function encryptArchive(
  json: string,
  passphrase: string,
  override?: ArchiveSaltNonceOverride,
): Promise<ArchiveEnvelope> {
  const salt = override?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const nonce = override?.nonce ?? crypto.getRandomValues(new Uint8Array(12));
  const key = await argon2idAsync(passphrase, salt, { ...ARCHIVE_KDF_PARAMS, dkLen: 32 });
  const ciphertext = gcm(key, nonce).encrypt(new TextEncoder().encode(json));
  return {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_ENVELOPE_VERSION,
    kdf: { alg: "argon2id", ...ARCHIVE_KDF_PARAMS, salt: bytesToBase64(salt) },
    cipher: { alg: "aes-256-gcm", nonce: bytesToBase64(nonce) },
    ciphertext: bytesToBase64(ciphertext),
  };
}

/** Throws "unsupported_archive_format" for anything that is not this envelope,
 *  "archive_too_new" for a newer envelope version, and "decrypt_failed" for a
 *  wrong passphrase or damaged ciphertext. */
export async function decryptArchive(fileText: string, passphrase: string): Promise<string> {
  let env: Partial<ArchiveEnvelope> | null;
  try {
    env = JSON.parse(fileText) as Partial<ArchiveEnvelope> | null;
  } catch {
    throw new Error("unsupported_archive_format");
  }
  if (!env || env.format !== ARCHIVE_FORMAT) throw new Error("unsupported_archive_format");
  if (env.version !== ARCHIVE_ENVELOPE_VERSION) throw new Error("archive_too_new");
  const { kdf, cipher } = env;
  if (
    kdf?.alg !== "argon2id" ||
    cipher?.alg !== "aes-256-gcm" ||
    typeof kdf.salt !== "string" ||
    typeof cipher.nonce !== "string" ||
    typeof env.ciphertext !== "string"
  ) {
    throw new Error("unsupported_archive_format");
  }

  const key = await argon2idAsync(passphrase, base64ToBytes(kdf.salt), { m: kdf.m, t: kdf.t, p: kdf.p, dkLen: 32 });
  try {
    return new TextDecoder().decode(gcm(key, base64ToBytes(cipher.nonce)).decrypt(base64ToBytes(env.ciphertext)));
  } catch {
    throw new Error("decrypt_failed");
  }
}

export function suggestArchiveFilename(now = new Date()): string {
  return `wavvon-archive-${now.toISOString().slice(0, 10)}${ARCHIVE_FILE_EXTENSION}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
