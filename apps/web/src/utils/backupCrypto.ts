import type { IdentityRecord } from "@identity/index";
import { BACKUP_FORMAT, BACKUP_ENVELOPE_VERSION, serializeBackupPayload } from "./identityBackupPayload";

// PBKDF2/AES-GCM ceremony for the `.wavvon-backup` envelope (identityBackupPayload.ts
// owns the envelope's non-crypto shape: format/version markers and payload
// serialization). Extracted so both the Settings export flow and the
// identity-creation "download encrypted backup" step produce byte-identical
// envelopes — these parameters are a compatibility surface, don't change them.
const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const NONCE_BYTES = 12;

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export async function encryptBackup(
  records: IdentityRecord[],
  passphrase: string,
  label: string | null,
): Promise<Blob> {
  const payloadJson = serializeBackupPayload(records);

  const enc = new TextEncoder();
  const saltArr = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const nonceArr = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase).buffer as ArrayBuffer, "PBKDF2", false, ["deriveKey"]);
  const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltArr, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonceArr },
    aesKey,
    enc.encode(payloadJson).buffer as ArrayBuffer,
  );

  const envelope = {
    format: BACKUP_FORMAT,
    version: BACKUP_ENVELOPE_VERSION,
    kdf: { alg: "pbkdf2-sha256", salt: bufToBase64(saltArr.buffer as ArrayBuffer), iterations: PBKDF2_ITERATIONS },
    cipher: { alg: "aes-256-gcm", nonce: bufToBase64(nonceArr.buffer as ArrayBuffer), ciphertext: bufToBase64(ciphertext) },
    created_at: Math.floor(Date.now() / 1000),
    label: label || null,
  };

  return new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
}
