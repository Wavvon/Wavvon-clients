import { argon2idAsync } from "@noble/hashes/argon2";

// Passphrase envelope for the personal data archive (docs/docs/data-export.md
// §2). Argon2id -> AES-256-GCM, matching the desktop identity-backup KDF
// parameters (identity_cmd.rs) but a distinct, self-describing envelope:
// "kind" separates archive files from plain identity backups on import.

export const ARCHIVE_FORMAT = "wavvon-archive" as const;
export const ARCHIVE_ENVELOPE_VERSION = 1;

const ARGON2_MEMORY_KIB = 65536; // 64 MiB
const ARGON2_TIME_COST = 3;
const ARGON2_PARALLELISM = 1;
const AES_KEY_BYTES = 32;
const SALT_BYTES = 16;
const NONCE_BYTES = 12;

export interface ArchiveEnvelope {
  format: typeof ARCHIVE_FORMAT;
  version: number;
  kdf: { alg: "argon2id"; m: number; t: number; p: number; salt: string };
  cipher: { alg: "aes-256-gcm"; nonce: string };
  ciphertext: string;
}

function bufToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  m: number,
  t: number,
  p: number,
): Promise<CryptoKey> {
  const keyBytes = await argon2idAsync(new TextEncoder().encode(passphrase), salt, {
    m,
    t,
    p,
    dkLen: AES_KEY_BYTES,
  });
  return crypto.subtle.importKey("raw", keyBytes as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptArchive(json: string, passphrase: string): Promise<Blob> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const key = await deriveKey(passphrase, salt, ARGON2_MEMORY_KIB, ARGON2_TIME_COST, ARGON2_PARALLELISM);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(json)),
  );

  const envelope: ArchiveEnvelope = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_ENVELOPE_VERSION,
    kdf: {
      alg: "argon2id",
      m: ARGON2_MEMORY_KIB,
      t: ARGON2_TIME_COST,
      p: ARGON2_PARALLELISM,
      salt: bufToBase64(salt),
    },
    cipher: { alg: "aes-256-gcm", nonce: bufToBase64(nonce) },
    ciphertext: bufToBase64(ciphertext),
  };

  return new Blob([JSON.stringify(envelope, null, 2)], { type: "application/octet-stream" });
}

export async function decryptArchive(envelopeJson: string, passphrase: string): Promise<string> {
  let envelope: ArchiveEnvelope;
  try {
    envelope = JSON.parse(envelopeJson) as ArchiveEnvelope;
  } catch {
    throw new Error("Not a valid archive file.");
  }
  if (envelope.format !== ARCHIVE_FORMAT) throw new Error("Not a Wavvon archive file.");
  if (envelope.version !== ARCHIVE_ENVELOPE_VERSION) {
    throw new Error("This archive was made by a newer version of Wavvon.");
  }

  const salt = base64ToBuf(envelope.kdf.salt);
  const nonce = base64ToBuf(envelope.cipher.nonce);
  const ciphertext = base64ToBuf(envelope.ciphertext);
  const key = await deriveKey(passphrase, salt, envelope.kdf.m, envelope.kdf.t, envelope.kdf.p);

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce as BufferSource },
      key,
      ciphertext as BufferSource,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("Couldn't unlock — wrong passphrase or the file is damaged.");
  }
}
