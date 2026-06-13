import { openDB, type IDBPDatabase } from "idb";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@voxply/utils";

export interface IdentityRecord {
  id: "main";
  seed_hex: string;
  security_nonce: number;
  security_level: number;
}

export interface SubkeyCert {
  master_pubkey: string;
  subkey_pubkey: string;
  device_label: string;
  issued_at: number;
  not_after: number | null;
  fallback_hubs: string[];
  signature: string;
}

export interface PairedState {
  id: "main";
  subkey_private_hex: string;
  cert: SubkeyCert;
}

let _db: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (!_db) {
    _db = await openDB("voxply", 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore("identity", { keyPath: "id" });
        }
        if (oldVersion < 2) {
          db.createObjectStore("paired", { keyPath: "id" });
        }
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

// Hex helpers live in the shared package; re-exported here because the
// identity modules historically import them from the store.
export { bytesToHex, hexToBytes } from "@voxply/utils";

export async function loadPairedState(): Promise<PairedState | null> {
  const db = await getDb();
  const result = await db.get("paired", "main");
  return result ?? null;
}

export async function savePairedState(state: Omit<PairedState, "id">): Promise<void> {
  const db = await getDb();
  await db.put("paired", { ...state, id: "main" });
}

export async function clearPairedState(): Promise<void> {
  const db = await getDb();
  await db.delete("paired", "main");
}
