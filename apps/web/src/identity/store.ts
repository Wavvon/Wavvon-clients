import { openDB, type IDBPDatabase } from "idb";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "@wavvon/core";

export interface IdentityRecord {
  id: "main";
  seed_hex: string;
  security_nonce: number;
  security_level: number;
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

export { bytesToHex, hexToBytes } from "@wavvon/core";
