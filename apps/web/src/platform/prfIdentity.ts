// Passkey-derived (WebAuthn PRF) identity bootstrap — fully client-side, no
// hub API calls. See docs/docs/webauthn-auth.md, "Cross-client master key
// via Bitwarden PRF". This is distinct from webauthn.ts, which drives the
// hub-session auth ceremony (registerPasskey / authenticateWithPasskey).
//
// The credential created here is never sent to a hub — it exists purely to
// hold a PRF secret. Its rp.id is the current page's origin, so the same
// passkey (synced via Bitwarden/1Password/iCloud/Google) re-derives the same
// master seed on any device that opens this app and is signed into that
// passkey provider.

import { prfSaltBytes, prfOutputToSeedHex } from "@wavvon/core";
import { isPasskeySupported } from "./webauthn";

export class PrfUnsupportedError extends Error {
  constructor(
    message = "This browser or authenticator doesn't support passkey-derived identities (the PRF extension).",
  ) {
    super(message);
    this.name = "PrfUnsupportedError";
  }
}

// --- Pure helpers (no navigator access — the part that's actually testable) ---

export function bufferSourceToBytes(bs: BufferSource): Uint8Array {
  if (bs instanceof ArrayBuffer) return new Uint8Array(bs);
  return new Uint8Array(bs.buffer, bs.byteOffset, bs.byteLength);
}

// `enabled` is only meaningful on a create() response — it tells us whether
// the authenticator understood the PRF extension at all, independent of
// whether it could produce an output synchronously.
export function prfExtensionEnabled(ext: AuthenticationExtensionsClientOutputs): boolean {
  return ext.prf?.enabled === true;
}

export function extractPrfOutput(ext: AuthenticationExtensionsClientOutputs): Uint8Array | undefined {
  const first = ext.prf?.results?.first;
  return first ? bufferSourceToBytes(first) : undefined;
}

export function buildPrfCreationOptions(params: {
  rpId: string;
  rpName: string;
  challenge: Uint8Array<ArrayBuffer>;
  userId: Uint8Array<ArrayBuffer>;
  salt: Uint8Array<ArrayBuffer>;
}): PublicKeyCredentialCreationOptions {
  return {
    rp: { id: params.rpId, name: params.rpName },
    user: { id: params.userId, name: "wavvon-identity", displayName: "Wavvon identity" },
    challenge: params.challenge,
    // Ed25519, ES256, RS256 — broad authenticator coverage. Wavvon never
    // inspects this keypair; only the PRF output matters.
    pubKeyCredParams: [
      { type: "public-key", alg: -8 },
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    authenticatorSelection: {
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required",
    },
    extensions: { prf: { eval: { first: params.salt } } },
    timeout: 60_000,
  };
}

export function buildPrfRequestOptions(params: {
  challenge: Uint8Array<ArrayBuffer>;
  salt: Uint8Array<ArrayBuffer>;
  allowCredentials?: PublicKeyCredentialDescriptor[];
}): PublicKeyCredentialRequestOptions {
  return {
    challenge: params.challenge,
    allowCredentials: params.allowCredentials,
    userVerification: "required",
    extensions: { prf: { eval: { first: params.salt } } },
    timeout: 60_000,
  };
}

// --- Ceremony (navigator.credentials access lives only in these functions) ---

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

async function requestPrfViaAssertion(
  salt: Uint8Array<ArrayBuffer>,
  allowCredentials?: PublicKeyCredentialDescriptor[],
): Promise<Uint8Array> {
  const options = buildPrfRequestOptions({ challenge: randomBytes(32), salt, allowCredentials });

  let cred: PublicKeyCredential;
  try {
    const result = await navigator.credentials.get({ publicKey: options });
    if (!result) throw new Error("No credential returned by authenticator");
    cred = result as PublicKeyCredential;
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotAllowedError")
      throw new Error("Passkey sign-in was cancelled");
    throw e;
  }

  const output = extractPrfOutput(cred.getClientExtensionResults());
  if (!output) throw new PrfUnsupportedError();
  return output;
}

// Create a brand-new passkey and derive the identity entropy from its PRF
// output. Many authenticators (notably platform ones on first create()) only
// report `prf.enabled` without the actual output — when that happens we
// immediately follow up with a get() scoped to the credential we just made,
// which is the documented way to obtain PRF results post-creation.
export async function createIdentityWithPasskey(
  rpName = "Wavvon",
): Promise<{ seedHex: string; credentialId: string }> {
  if (!isPasskeySupported()) throw new PrfUnsupportedError("Passkeys aren't supported in this browser.");

  const salt = prfSaltBytes();
  const options = buildPrfCreationOptions({
    rpId: window.location.hostname,
    rpName,
    challenge: randomBytes(32),
    userId: randomBytes(16),
    salt,
  });

  let cred: PublicKeyCredential;
  try {
    const result = await navigator.credentials.create({ publicKey: options });
    if (!result) throw new Error("No credential returned by authenticator");
    cred = result as PublicKeyCredential;
  } catch (e) {
    if (e instanceof DOMException) {
      if (e.name === "NotAllowedError") throw new Error("Passkey creation was cancelled");
      if (e.name === "SecurityError")
        throw new Error("Passkeys require this app to be served over HTTPS (or localhost).");
    }
    throw e;
  }

  const ext = cred.getClientExtensionResults();
  if (!prfExtensionEnabled(ext)) throw new PrfUnsupportedError();

  const output = extractPrfOutput(ext) ?? (await requestPrfViaAssertion(salt, [{ id: cred.rawId, type: "public-key" }]));

  return { seedHex: prfOutputToSeedHex(output), credentialId: cred.id };
}

// Returning-user flow: a discoverable-credential assertion (no
// allowCredentials) re-derives the same identity entropy on any device where
// the user's passkey provider is signed in.
export async function restoreIdentityWithPasskey(): Promise<string> {
  if (!isPasskeySupported()) throw new PrfUnsupportedError("Passkeys aren't supported in this browser.");
  const output = await requestPrfViaAssertion(prfSaltBytes());
  return prfOutputToSeedHex(output);
}
