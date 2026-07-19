import { describe, it, expect } from "vitest";
import { encryptBackup } from "../backupCrypto";
import { BACKUP_FORMAT, BACKUP_ENVELOPE_VERSION, validateBackupEnvelopeMeta, parseBackupPayload } from "../identityBackupPayload";
import type { IdentityRecord } from "../../identity/store";

interface DecodedEnvelope {
  format: unknown;
  version: unknown;
  kdf: { alg: string; salt: string; iterations: number };
  cipher: { alg: string; nonce: string; ciphertext: string };
  created_at: number;
  label: string | null;
}

function base64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Mirrors IdentityBackupSection.handleImport's decrypt ceremony exactly (same
// PBKDF2/AES-GCM parameters), standing in for the app's decrypt path so this
// test proves the envelope encryptBackup produces is importable by it.
async function decryptViaImportPath(envelopeJson: string, passphrase: string): Promise<IdentityRecord[]> {
  const envelope = JSON.parse(envelopeJson) as DecodedEnvelope;
  validateBackupEnvelopeMeta(envelope);

  const enc = new TextEncoder();
  const saltBuf = base64ToBuf(envelope.kdf.salt);
  const nonceBuf = base64ToBuf(envelope.cipher.nonce);
  const ciphertextBuf = base64ToBuf(envelope.cipher.ciphertext);

  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase).buffer as ArrayBuffer, "PBKDF2", false, ["deriveKey"]);
  const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBuf.buffer as ArrayBuffer, iterations: envelope.kdf.iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonceBuf.buffer as ArrayBuffer }, aesKey, ciphertextBuf.buffer as ArrayBuffer);
  return parseBackupPayload(new TextDecoder().decode(plaintext));
}

function record(id: string): IdentityRecord {
  return { id, seed_hex: `seed-${id}`, security_nonce: 0, security_level: 0 };
}

describe("encryptBackup", () => {
  it("round-trips a single account through the app's import/decrypt path", async () => {
    const records = [record("aaaa1111")];
    const blob = await encryptBackup(records, "correct horse battery staple", null);
    const envelopeJson = await blob.text();

    const recovered = await decryptViaImportPath(envelopeJson, "correct horse battery staple");
    expect(recovered).toEqual(records);
  }, 20000);

  it("carries the label through the envelope", async () => {
    const blob = await encryptBackup([record("aaaa1111")], "correct horse battery staple", "laptop backup");
    const envelope = JSON.parse(await blob.text()) as DecodedEnvelope;
    expect(envelope.label).toBe("laptop backup");
  }, 20000);

  it("fails cleanly with the wrong passphrase", async () => {
    const blob = await encryptBackup([record("aaaa1111")], "right-passphrase", null);
    const envelopeJson = await blob.text();
    await expect(decryptViaImportPath(envelopeJson, "wrong-passphrase")).rejects.toThrow();
  }, 20000);

  it("produces the current self-describing, versioned wavvon-backup envelope", async () => {
    const blob = await encryptBackup([record("aaaa1111")], "passphrase123", null);
    const envelope = JSON.parse(await blob.text()) as DecodedEnvelope;
    expect(envelope.format).toBe(BACKUP_FORMAT);
    expect(envelope.version).toBe(BACKUP_ENVELOPE_VERSION);
    expect(envelope.kdf.alg).toBe("pbkdf2-sha256");
    expect(envelope.kdf.iterations).toBe(100000);
    expect(envelope.cipher.alg).toBe("aes-256-gcm");
  }, 20000);
});
