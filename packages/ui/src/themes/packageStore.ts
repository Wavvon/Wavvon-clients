import type { PackageFiles } from "./packageFormat";

export interface StoredPackage<M> {
  id: string;
  manifest: M;
  files: PackageFiles;
}

export interface PackageStore<M> {
  list(): Promise<StoredPackage<M>[]>;
  put(pkg: StoredPackage<M>): Promise<void>;
  remove(id: string): Promise<void>;
}

const OBJECTS = "packages";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Packages carry binary files (up to 8 MB), too big for localStorage, so
// they live in IndexedDB — device-wide, not per account.
export function createIdbPackageStore<M>(dbName: string): PackageStore<M> {
  const open = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(OBJECTS, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await open();
    try {
      return await request(fn(db.transaction(OBJECTS, mode).objectStore(OBJECTS)));
    } finally {
      db.close();
    }
  }
  return {
    list: () => run("readonly", (s) => s.getAll() as IDBRequest<StoredPackage<M>[]>),
    put: async (pkg) => void (await run("readwrite", (s) => s.put(pkg))),
    remove: async (id) => void (await run("readwrite", (s) => s.delete(id))),
  };
}

export function createMemoryPackageStore<M>(): PackageStore<M> {
  const map = new Map<string, StoredPackage<M>>();
  return {
    list: async () => [...map.values()],
    put: async (p) => void map.set(p.id, p),
    remove: async (id) => void map.delete(id),
  };
}

export function newPackageId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `pkg-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
