import { load } from "@tauri-apps/plugin-store";
import { ed25519 } from "@noble/curves/ed25519";

export interface IdentityRecord {
  seed_hex: string;
  security_nonce: string;
  security_level: number;
}

export type { SubkeyCert, PairedState } from "../identity/store";
export { loadPairedState, savePairedState, clearPairedState } from "../identity/store";

const STORE_KEY = "identity";

async function getStore() {
  return load("identity.bin", { defaults: {}, autoSave: true });
}

export async function loadIdentity(): Promise<IdentityRecord | null> {
  const store = await getStore();
  const value = await store.get<IdentityRecord>(STORE_KEY);
  return value ?? null;
}

export async function saveIdentity(rec: IdentityRecord): Promise<void> {
  const store = await getStore();
  await store.set(STORE_KEY, rec);
}

export async function clearIdentity(): Promise<void> {
  const store = await getStore();
  await store.delete(STORE_KEY);
}

export async function generateIdentity(): Promise<IdentityRecord> {
  const seed = ed25519.utils.randomPrivateKey();
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const rec: IdentityRecord = {
    seed_hex: bytesToHex(seed),
    security_nonce: bytesToHex(nonceBytes),
    security_level: 0,
  };
  await saveIdentity(rec);
  return rec;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
