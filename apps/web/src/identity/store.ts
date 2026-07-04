import { openDB, type IDBPDatabase } from "idb";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes, type SubkeyCert } from "@wavvon/core";

export interface IdentityRecord {
  id: "main";
  seed_hex: string;
  security_nonce: number;
  security_level: number;
  // Multi-device: once the user opts into pairing, we persist the master
  // pubkey and this device's own subkey cert. When present, the cert is sent
  // at auth so the hub resolves this device to the shared canonical identity.
  master_pubkey?: string;
  device_label?: string;
  subkey_cert?: SubkeyCert;
  // The canonical identity the hub attributes this device's actions to. For a
  // paired device this differs from publicKeyHex(seed_hex); the UI uses it to
  // self-identify. Learned from the auth/verify response.
  canonical_pubkey?: string;
}

let _db: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (!_db) {
    _db = await openDB("wavvon", 1, {
      upgrade(db) {
        db.createObjectStore("identity", { keyPath: "id" });
      },
    });
  }
  return _db;
}

export async function loadIdentity(): Promise<IdentityRecord | null> {
  const db = await getDb();
  const result = await db.get("identity", "main");
  return result ?? null;
}

export async function saveIdentity(record: IdentityRecord): Promise<void> {
  const db = await getDb();
  await db.put("identity", record);
}

export async function generateIdentity(): Promise<IdentityRecord> {
  const seed = ed25519.utils.randomPrivateKey();
  const record: IdentityRecord = {
    id: "main",
    seed_hex: bytesToHex(seed),
    security_nonce: 0,
    security_level: 0,
  };
  await saveIdentity(record);
  return record;
}

// A fresh random 32-byte ed25519 seed (hex), not persisted. Used to mint a new
// device's subkey during pairing.
export function generateSubkeySeed(): string {
  return bytesToHex(ed25519.utils.randomPrivateKey());
}

export { bytesToHex, hexToBytes } from "@wavvon/core";
