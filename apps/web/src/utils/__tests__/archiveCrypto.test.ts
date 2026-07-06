import { describe, it, expect } from "vitest";
import { encryptArchive, decryptArchive, ARCHIVE_FORMAT, ARCHIVE_ENVELOPE_VERSION } from "../archiveCrypto";

describe("archive envelope round trip", () => {
  it("recovers the original JSON with the correct passphrase", async () => {
    const json = JSON.stringify({ hello: "world", n: 42 });
    const blob = await encryptArchive(json, "correct horse battery staple");
    const envelopeText = await blob.text();

    const recovered = await decryptArchive(envelopeText, "correct horse battery staple");
    expect(recovered).toBe(json);
  }, 20000);

  it("fails cleanly with the wrong passphrase", async () => {
    const json = JSON.stringify({ secret: "value" });
    const blob = await encryptArchive(json, "right-passphrase");
    const envelopeText = await blob.text();

    await expect(decryptArchive(envelopeText, "wrong-passphrase")).rejects.toThrow();
  }, 20000);

  it("produces a self-describing, versioned envelope", async () => {
    const blob = await encryptArchive("{}", "passphrase123");
    const envelope = JSON.parse(await blob.text()) as {
      format: string;
      version: number;
      kdf: { alg: string };
      cipher: { alg: string };
    };
    expect(envelope.format).toBe(ARCHIVE_FORMAT);
    expect(envelope.version).toBe(ARCHIVE_ENVELOPE_VERSION);
    expect(envelope.kdf.alg).toBe("argon2id");
    expect(envelope.cipher.alg).toBe("aes-256-gcm");
  }, 20000);

  it("rejects a file that isn't a wavvon archive", async () => {
    const other = JSON.stringify({ format: "wavvon-backup", version: 1 });
    await expect(decryptArchive(other, "whatever")).rejects.toThrow();
  });
});
