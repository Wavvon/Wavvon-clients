import type { IdentityRecord } from "@identity/index";

// The identity backup envelope wraps a JSON payload in a passphrase-derived
// AES-GCM cipher (see IdentityBackupSection.tsx for the WebCrypto ceremony).
// Version 1 files (anything written before this array-payload change shipped)
// hold a single IdentityRecord object; version 2 always holds an array, even
// for a one-account export. Import must accept both.
export const BACKUP_FORMAT = "wavvon-backup" as const;
export const BACKUP_ENVELOPE_VERSION = 2;
const MIN_SUPPORTED_BACKUP_VERSION = 1;

export interface BackupEnvelopeMeta {
  format?: unknown;
  version?: unknown;
}

export function validateBackupEnvelopeMeta(envelope: BackupEnvelopeMeta): void {
  if (envelope.format !== BACKUP_FORMAT) throw new Error("Not a Wavvon backup file.");
  if (typeof envelope.version !== "number" || envelope.version > BACKUP_ENVELOPE_VERSION) {
    throw new Error("This backup was made by a newer version of Wavvon.");
  }
  if (envelope.version < MIN_SUPPORTED_BACKUP_VERSION) {
    throw new Error("Not a Wavvon backup file.");
  }
}

export function serializeBackupPayload(records: IdentityRecord[]): string {
  return JSON.stringify(records);
}

// Normalizes both the old single-object payload shape and the new array
// shape to an array, then validates every entry looks like an identity.
export function parseBackupPayload(plaintextJson: string): IdentityRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintextJson);
  } catch {
    throw new Error("Invalid backup content.");
  }
  const records = Array.isArray(parsed) ? parsed : [parsed];
  if (records.length === 0) throw new Error("Invalid backup content.");
  for (const record of records) {
    if (!record || typeof record !== "object" || typeof (record as Partial<IdentityRecord>).seed_hex !== "string") {
      throw new Error("Invalid backup content.");
    }
  }
  return records as IdentityRecord[];
}

function shortFingerprint(id: string): string {
  return id.slice(0, 8);
}

export function suggestBackupFilename(records: Pick<IdentityRecord, "id">[], now: Date): string {
  const date = now.toISOString().slice(0, 10);
  if (records.length <= 1) {
    const fp = records[0] ? shortFingerprint(records[0].id) : "identity";
    return `wavvon-identity-${fp}-${date}.wavvon-backup`;
  }
  return `wavvon-identities-${records.length}-${date}.wavvon-backup`;
}
