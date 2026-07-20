import { describe, expect, it } from "vitest";
import { encryptBackup, decryptBackup, isBackupEnvelope, suggestBackupFilename } from "./backup";

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Fixed salt/nonce/passphrase/account — desktop's Rust implementation must
// produce this exact envelope byte-for-byte (settings-ia.md §4a).
const VECTOR_SALT = hexToBytes("000102030405060708090a0b0c0d0e0f");
const VECTOR_NONCE = hexToBytes("101112131415161718191a1b");
const VECTOR_PASSPHRASE = "correct horse battery staple";
const VECTOR_ACCOUNT = { label: "test-account", secret_key_hex: "a1".repeat(32) };
const VECTOR_CIPHERTEXT =
  "Z09hWEMqmbrPQD9lNMlEFy9pan5hNuegXFeJ2AmOE+YR2F/ghRqpwup+yNHFfVh55NxxC3ebPnQ2udg+wbHqgkRmRr6FmmMZgpUCPpSHuiKQrKd5/zyTgWWpW95UD0UnvH1etfgvvKBnKdO/ADl+5gsyBEb8Upi1FTwHnw==";

// Argon2id at 64 MiB legitimately takes seconds; under parallel test load the
// default 5s vitest timeout flakes. KDF-running tests get explicit headroom.
const KDF_TIMEOUT = 30_000;

describe("identity backup envelope", () => {
  it("matches the shared cross-platform test vector", { timeout: KDF_TIMEOUT }, async () => {
    const envelope = await encryptBackup(VECTOR_ACCOUNT, VECTOR_PASSPHRASE, {
      salt: VECTOR_SALT,
      nonce: VECTOR_NONCE,
    });
    expect(envelope).toEqual({
      version: 1,
      kdf: "argon2id",
      kdf_params: { m: 65536, t: 3, p: 1 },
      salt: "AAECAwQFBgcICQoLDA0ODw==",
      nonce: "EBESExQVFhcYGRob",
      ciphertext: VECTOR_CIPHERTEXT,
    });
  });

  it("round-trips through decrypt", { timeout: KDF_TIMEOUT }, async () => {
    const envelope = await encryptBackup(VECTOR_ACCOUNT, VECTOR_PASSPHRASE, {
      salt: VECTOR_SALT,
      nonce: VECTOR_NONCE,
    });
    const decrypted = await decryptBackup(JSON.stringify(envelope), VECTOR_PASSPHRASE);
    expect(decrypted).toEqual(VECTOR_ACCOUNT);
  });

  it("rejects a wrong passphrase", { timeout: KDF_TIMEOUT }, async () => {
    const envelope = await encryptBackup(VECTOR_ACCOUNT, VECTOR_PASSPHRASE, {
      salt: VECTOR_SALT,
      nonce: VECTOR_NONCE,
    });
    await expect(decryptBackup(JSON.stringify(envelope), "wrong passphrase")).rejects.toThrow(
      "decrypt_failed",
    );
  });

  it("rejects an unrecognized envelope shape (old web PBKDF2 file / desktop .voxback)", { timeout: KDF_TIMEOUT }, async () => {
    const legacy = JSON.stringify({
      format: "wavvon-backup",
      version: 2,
      kdf: { alg: "pbkdf2-sha256", salt: "abc", iterations: 100000 },
      cipher: { alg: "aes-256-gcm", nonce: "def", ciphertext: "ghi" },
    });
    await expect(decryptBackup(legacy, VECTOR_PASSPHRASE)).rejects.toThrow("unsupported_backup_format");
    expect(isBackupEnvelope(JSON.parse(legacy))).toBe(false);
  });

  it("suggests a filename with the .wavvon-backup extension", () => {
    const name = suggestBackupFilename("My Laptop!", new Date("2026-07-20T00:00:00Z"));
    expect(name).toBe("wavvon-my-laptop-2026-07-20.wavvon-backup");
  });
});
