import { bytesToHex } from "../hex";

// WebAuthn PRF eval salt used to derive a Wavvon master identity from a
// passkey (docs/docs/webauthn-auth.md, "Cross-client master key via Bitwarden
// PRF"). This is a wire-level protocol constant: it MUST be byte-identical
// across every client (web, desktop) that derives a master key from
// PRF. Changing this string changes the derived key for every existing
// passkey-backed identity — never change it, only ever add a new versioned
// label alongside it.
export const PRF_SALT_LABEL = "wavvon-master/v1";

export function prfSaltBytes(): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(PRF_SALT_LABEL);
}

export class PrfOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrfOutputError";
  }
}

// The 32-byte PRF output IS the identity entropy — the same slot BIP39
// entropy occupies today. Everything downstream (master.ts HKDF, the
// ed25519 seed, entropyToMnemonic) works unchanged on top of it, so this
// helper only validates shape and hex-encodes.
export function prfOutputToSeedHex(output: Uint8Array): string {
  if (output.length !== 32) {
    throw new PrfOutputError(`Expected 32-byte PRF output, got ${output.length} bytes`);
  }
  return bytesToHex(output);
}
