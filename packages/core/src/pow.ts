import { sha256 } from "@noble/hashes/sha256";

// Mirrors identity::pow (server/crates/identity/src/pow.rs) byte-for-byte —
// the hub re-verifies every claim with that Rust implementation, so this
// must hash the same bytes in the same order. (The desktop Tauri shell runs
// PoW in Rust instead.) The join-time protocol — SHA256(pubkey_hex_ascii ||
// nonce_le_u64), count leading zero bits — is shared across every client.

/** Count leading zero bits in a hash output. */
export function leadingZeroBits(hash: Uint8Array): number {
  let count = 0;
  for (const byte of hash) {
    if (byte === 0) {
      count += 8;
      continue;
    }
    count += Math.clz32(byte) - 24;
    break;
  }
  return count;
}

function nonceToLeBytes(nonce: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  let n = nonce;
  for (let i = 0; i < 8; i++) {
    bytes[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return bytes;
}

function hashLevel(pubkeyHex: string, nonce: bigint): number {
  const pkBytes = new TextEncoder().encode(pubkeyHex);
  const nonceBytes = nonceToLeBytes(nonce);
  const input = new Uint8Array(pkBytes.length + nonceBytes.length);
  input.set(pkBytes, 0);
  input.set(nonceBytes, pkBytes.length);
  return leadingZeroBits(sha256(input));
}

/** Verify a claimed (nonce, level) pair locally — matches the hub's check. */
export function verifySecurityLevel(pubkeyHex: string, nonce: bigint, claimedLevel: number): boolean {
  if (claimedLevel === 0) return true;
  return hashLevel(pubkeyHex, nonce) >= claimedLevel;
}

export interface PowMineChunkResult {
  /** Best nonce found in this chunk, if it improved on `bestLevelSoFar`. */
  bestNonce: bigint;
  /** Highest level reached so far (either `bestLevelSoFar` or a new best). */
  bestLevel: number;
  /** Last nonce tried — pass as the next chunk's `startNonce`. */
  lastNonce: bigint;
  reachedTarget: boolean;
}

/**
 * Search up to `iterations` nonces starting after `startNonce`, tracking the
 * best (highest leading-zero-bit) result found. Chunked so a caller (a Web
 * Worker loop, or the desktop Rust equivalent) can yield/report progress
 * between calls instead of blocking for however long the full target level
 * takes — PoW search is memoryless, so resuming from any `startNonce` after
 * a pause costs nothing statistically.
 */
export function minePowChunk(
  pubkeyHex: string,
  startNonce: bigint,
  targetLevel: number,
  iterations: number,
  bestLevelSoFar = 0,
): PowMineChunkResult {
  let bestNonce = startNonce;
  let bestLevel = bestLevelSoFar;
  let nonce = startNonce;
  for (let i = 0; i < iterations; i++) {
    nonce += 1n;
    const level = hashLevel(pubkeyHex, nonce);
    if (level > bestLevel) {
      bestLevel = level;
      bestNonce = nonce;
      if (bestLevel >= targetLevel) {
        return { bestNonce, bestLevel, lastNonce: nonce, reachedTarget: true };
      }
    }
  }
  return { bestNonce, bestLevel, lastNonce: nonce, reachedTarget: false };
}

/** Encodes a (nonce, level) pair as the hub's `pow_proof` string format. */
export function powProofString(nonce: bigint, level: number): string {
  return `${nonce.toString()}:${level}`;
}
