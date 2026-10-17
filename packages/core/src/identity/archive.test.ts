import { describe, expect, it } from "vitest";
import { encryptArchive, decryptArchive, suggestArchiveFilename } from "./archive";

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Fixed inputs shared with apps/desktop/src-tauri/src/archive.rs and spelled
// out in the docs wiki's data-export.md §0. The plaintext carries a non-ASCII
// character so both sides are pinned to UTF-8, not just ASCII.
const VECTOR_SALT = hexToBytes("000102030405060708090a0b0c0d0e0f");
const VECTOR_NONCE = hexToBytes("101112131415161718191a1b");
const VECTOR_PASSPHRASE = "correct horse battery staple";
const VECTOR_PLAINTEXT = '{"kind":"full-archive","version":1,"drafts":{"hub/chan":"héllo"}}';
const VECTOR_CIPHERTEXT =
  "Z09mUE8r16LXBD5sK5AIBC9ibH1qYOmuCEGeyBKECZtAjAqdiQ2whqQvi9rfblE958JzUnfEfX914HqmzOzkkVgqoN0g34v3b+vz7Z/m70IWjA==";

// Argon2id at 64 MiB takes seconds under parallel test load.
const KDF_TIMEOUT = 30_000;

async function vectorEnvelope() {
  return encryptArchive(VECTOR_PLAINTEXT, VECTOR_PASSPHRASE, { salt: VECTOR_SALT, nonce: VECTOR_NONCE });
}

describe("wavvon-archive envelope", () => {
  it("matches the shared cross-platform test vector", { timeout: KDF_TIMEOUT }, async () => {
    expect(await vectorEnvelope()).toEqual({
      format: "wavvon-archive",
      version: 1,
      kdf: { alg: "argon2id", m: 65536, t: 3, p: 1, salt: "AAECAwQFBgcICQoLDA0ODw==" },
      cipher: { alg: "aes-256-gcm", nonce: "EBESExQVFhcYGRob" },
      ciphertext: VECTOR_CIPHERTEXT,
    });
  });

  it("round-trips through decrypt", { timeout: KDF_TIMEOUT }, async () => {
    const text = JSON.stringify(await vectorEnvelope(), null, 2);
    expect(await decryptArchive(text, VECTOR_PASSPHRASE)).toBe(VECTOR_PLAINTEXT);
  });

  it("rejects a wrong passphrase", { timeout: KDF_TIMEOUT }, async () => {
    const text = JSON.stringify(await vectorEnvelope());
    await expect(decryptArchive(text, "wrong passphrase")).rejects.toThrow("decrypt_failed");
  });

  it("rejects an identity backup and a newer envelope version", { timeout: KDF_TIMEOUT }, async () => {
    const backup = JSON.stringify({ version: 1, kdf: "argon2id", salt: "", nonce: "", ciphertext: "" });
    await expect(decryptArchive(backup, VECTOR_PASSPHRASE)).rejects.toThrow("unsupported_archive_format");
    await expect(decryptArchive("not json", VECTOR_PASSPHRASE)).rejects.toThrow("unsupported_archive_format");
    const newer = JSON.stringify({ ...(await vectorEnvelope()), version: 2 });
    await expect(decryptArchive(newer, VECTOR_PASSPHRASE)).rejects.toThrow("archive_too_new");
  });

  it("suggests a dated .json.enc filename", () => {
    expect(suggestArchiveFilename(new Date("2026-10-17T12:00:00Z"))).toBe("wavvon-archive-2026-10-17.json.enc");
  });
});
