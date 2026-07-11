import { describe, it, expect } from "vitest";
import {
  BACKUP_FORMAT,
  BACKUP_ENVELOPE_VERSION,
  validateBackupEnvelopeMeta,
  serializeBackupPayload,
  parseBackupPayload,
  suggestBackupFilename,
} from "../identityBackupPayload";
import type { IdentityRecord } from "../../identity/store";

function record(id: string): IdentityRecord {
  return { id, seed_hex: `seed-${id}`, security_nonce: 0, security_level: 0 };
}

describe("serializeBackupPayload / parseBackupPayload", () => {
  it("round-trips a single-account payload as an array", () => {
    const records = [record("aaaa1111")];
    const parsed = parseBackupPayload(serializeBackupPayload(records));
    expect(parsed).toEqual(records);
  });

  it("round-trips a multi-account payload", () => {
    const records = [record("aaaa1111"), record("bbbb2222"), record("cccc3333")];
    const parsed = parseBackupPayload(serializeBackupPayload(records));
    expect(parsed).toEqual(records);
  });

  it("normalizes a legacy single-object payload to an array", () => {
    const legacy = record("aaaa1111");
    const parsed = parseBackupPayload(JSON.stringify(legacy));
    expect(parsed).toEqual([legacy]);
  });

  it("rejects a payload with no seed_hex", () => {
    expect(() => parseBackupPayload(JSON.stringify({ id: "x" }))).toThrow("Invalid backup content.");
  });

  it("rejects a payload where one array entry is malformed", () => {
    const bad = [record("aaaa1111"), { id: "no-seed" }];
    expect(() => parseBackupPayload(JSON.stringify(bad))).toThrow("Invalid backup content.");
  });

  it("rejects an empty array payload", () => {
    expect(() => parseBackupPayload(JSON.stringify([]))).toThrow("Invalid backup content.");
  });

  it("rejects payloads that aren't valid JSON", () => {
    expect(() => parseBackupPayload("not json")).toThrow("Invalid backup content.");
  });
});

describe("validateBackupEnvelopeMeta", () => {
  it("accepts the current version", () => {
    expect(() => validateBackupEnvelopeMeta({ format: BACKUP_FORMAT, version: BACKUP_ENVELOPE_VERSION })).not.toThrow();
  });

  it("accepts the legacy single-object version", () => {
    expect(() => validateBackupEnvelopeMeta({ format: BACKUP_FORMAT, version: 1 })).not.toThrow();
  });

  it("rejects a file with the wrong format marker", () => {
    expect(() => validateBackupEnvelopeMeta({ format: "something-else", version: 1 })).toThrow("Not a Wavvon backup file.");
  });

  it("rejects a version newer than this client understands", () => {
    expect(() => validateBackupEnvelopeMeta({ format: BACKUP_FORMAT, version: BACKUP_ENVELOPE_VERSION + 1 })).toThrow(
      "newer version",
    );
  });

  it("rejects a missing or non-numeric version", () => {
    expect(() => validateBackupEnvelopeMeta({ format: BACKUP_FORMAT })).toThrow();
    expect(() => validateBackupEnvelopeMeta({ format: BACKUP_FORMAT, version: "1" })).toThrow();
  });
});

describe("suggestBackupFilename", () => {
  const date = new Date("2026-07-11T12:00:00Z");

  it("uses the singular pattern for one account", () => {
    expect(suggestBackupFilename([{ id: "aaaa1111bbbb" }], date)).toBe(
      "wavvon-identity-aaaa1111-2026-07-11.wavvon-backup",
    );
  });

  it("uses the plural, count-based pattern for several accounts", () => {
    expect(suggestBackupFilename([{ id: "aaaa" }, { id: "bbbb" }, { id: "cccc" }], date)).toBe(
      "wavvon-identities-3-2026-07-11.wavvon-backup",
    );
  });

  it("falls back to a generic name when there are no records", () => {
    expect(suggestBackupFilename([], date)).toBe("wavvon-identity-identity-2026-07-11.wavvon-backup");
  });
});
