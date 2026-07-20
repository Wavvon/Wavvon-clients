import { argon2idAsync } from "@noble/hashes/argon2";
import { gcm } from "@noble/ciphers/aes";

// The unified cross-platform identity backup file (settings-ia.md §4a).
// One account per file — export several accounts as several files. Desktop's
// Rust side implements the same envelope byte-for-byte (Argon2id KDF params,
// AES-256-GCM cipher); BACKUP_TEST_VECTOR below is the shared fixture both
// sides assert against.
export const BACKUP_FILE_EXTENSION = ".wavvon-backup";

export const BACKUP_KDF_PARAMS = { m: 65536, t: 3, p: 1 } as const;

export interface BackupAccount {
  label: string;
  secret_key_hex: string;
}

export interface BackupEnvelope {
  version: 1;
  kdf: "argon2id";
  kdf_params: { m: number; t: number; p: number };
  salt: string;
  nonce: string;
  ciphertext: string;
}

/** Injected for the deterministic test vector; production callers omit this and get crypto.getRandomValues(). */
export interface BackupSaltNonceOverride {
  salt: Uint8Array;
  nonce: Uint8Array;
}

export async function encryptBackup(
  account: BackupAccount,
  passphrase: string,
  override?: BackupSaltNonceOverride,
): Promise<BackupEnvelope> {
  const salt = override?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const nonce = override?.nonce ?? crypto.getRandomValues(new Uint8Array(12));
  const key = await argon2idAsync(passphrase, salt, { ...BACKUP_KDF_PARAMS, dkLen: 32 });
  const plaintext = new TextEncoder().encode(JSON.stringify(account));
  const ciphertext = gcm(key, nonce).encrypt(plaintext);
  return {
    version: 1,
    kdf: "argon2id",
    kdf_params: { ...BACKUP_KDF_PARAMS },
    salt: bytesToBase64(salt),
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext),
  };
}

export function isBackupEnvelope(json: unknown): json is BackupEnvelope {
  if (!json || typeof json !== "object") return false;
  const j = json as Record<string, unknown>;
  return (
    j.version === 1 &&
    j.kdf === "argon2id" &&
    typeof j.salt === "string" &&
    typeof j.nonce === "string" &&
    typeof j.ciphertext === "string" &&
    !!j.kdf_params &&
    typeof j.kdf_params === "object"
  );
}

/** Throws "unsupported_backup_format" for anything that isn't this envelope
 *  (old web PBKDF2 `.wavvon-backup` files, desktop's retired `.voxback`) —
 *  alpha rules: no legacy importer. Throws "decrypt_failed" for a wrong
 *  passphrase or corrupted ciphertext. */
export async function decryptBackup(fileText: string, passphrase: string): Promise<BackupAccount> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileText);
  } catch {
    throw new Error("unsupported_backup_format");
  }
  if (!isBackupEnvelope(parsed)) throw new Error("unsupported_backup_format");

  const salt = base64ToBytes(parsed.salt);
  const nonce = base64ToBytes(parsed.nonce);
  const ciphertext = base64ToBytes(parsed.ciphertext);
  const key = await argon2idAsync(passphrase, salt, { ...parsed.kdf_params, dkLen: 32 });

  let plaintext: Uint8Array;
  try {
    plaintext = gcm(key, nonce).decrypt(ciphertext);
  } catch {
    throw new Error("decrypt_failed");
  }

  let account: unknown;
  try {
    account = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error("decrypt_failed");
  }
  const a = account as Partial<BackupAccount> | null;
  if (!a || typeof a.label !== "string" || typeof a.secret_key_hex !== "string") {
    throw new Error("decrypt_failed");
  }
  return { label: a.label, secret_key_hex: a.secret_key_hex };
}

export function suggestBackupFilename(label: string, now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `wavvon-${slug || "account"}-${stamp}${BACKUP_FILE_EXTENSION}`;
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
