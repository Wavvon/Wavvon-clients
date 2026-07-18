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
  /** Which ceremony stage established that PRF is unavailable:
   *  - "assertion": a get() ran and returned no PRF output — the
   *    authenticator genuinely can't produce the secret.
   *  - "creation": create() itself failed in a way that precedes any
   *    PRF question (no credential exists). */
  readonly stage: "creation" | "assertion";

  constructor(
    stage: "creation" | "assertion",
    message = "This browser or authenticator doesn't support passkey-derived identities (the PRF extension).",
  ) {
    super(message);
    this.name = "PrfUnsupportedError";
    this.stage = stage;
  }
}

/** The passkey delivered a secret at creation but failed the restore
 *  self-test (a scoped sign-in returned nothing) — creating an identity
 *  from it would mint one that LOOKS passkey-backed but can never be
 *  restored by the passkey (observed: Windows Hello 25H2). Creation is
 *  refused; the credential is orphaned and safe to delete. */
export class PrfRestoreUnverifiedError extends PrfUnsupportedError {
  constructor() {
    super(
      "assertion",
      "Your device created the passkey but couldn't prove it can restore your identity from it later — " +
        "the sign-in ceremony never returned the secret. No identity was created. " +
        "The new passkey entry is unused and safe to delete. " +
        "If you cancelled the prompt, just try again — otherwise create your identity with a " +
        "recovery phrase instead, or try a different passkey provider.",
    );
    this.name = "PrfRestoreUnverifiedError";
  }
}

/** The passkey was created and saved by the provider, but no PRF secret
 *  could be obtained from it — the credential is orphaned and safe to
 *  delete from the password manager. */
export class PrfOutputUnavailableError extends PrfUnsupportedError {
  constructor() {
    super(
      "assertion",
      "Your passkey was created, but the provider didn't supply the secret Wavvon derives your identity from (the PRF extension). " +
        "The new passkey entry is unused and safe to delete. " +
        // Bitwarden deliberately NOT suggested: its extension stores the
        // passkey but returns no PRF to third-party sites on any browser
        // (empirically confirmed 2026-07-18; known limitation on their
        // community forum). See docs/docs/webauthn-auth.md.
        "Try a provider with PRF support — e.g. Chrome's built-in passkeys, 1Password, or Apple Passwords.",
    );
    this.name = "PrfOutputUnavailableError";
  }
}

// --- Pure helpers (no navigator access — the part that's actually testable) ---

export function bufferSourceToBytes(bs: BufferSource): Uint8Array {
  // ArrayBuffer.isView is realm-safe; `instanceof ArrayBuffer` is NOT — a
  // buffer minted in another realm (e.g. handed across a password-manager
  // extension's boundary in Firefox) fails it and would fall into the view
  // branch, yielding an empty array. Duck-type the view first, treat
  // everything else as an ArrayBuffer-like.
  if (ArrayBuffer.isView(bs)) return new Uint8Array(bs.buffer, bs.byteOffset, bs.byteLength);
  return new Uint8Array(bs);
}

// NOTE: there is deliberately no helper reading `prf.enabled` — providers
// are inconsistent about reporting it on create() (Bitwarden/Firefox omits
// it while still serving PRF on get()), so nothing may branch on it. The
// only trustworthy signal is whether an assertion returns an output.
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
  if (!output) throw new PrfUnsupportedError("assertion");
  return output;
}

// Create a brand-new passkey and derive the identity entropy from its PRF
// output. Providers are inconsistent about when they answer PRF: many only
// report `prf.enabled` on create() without the output, and some (observed:
// Bitwarden extension on Firefox, 2026-07-18) omit `prf.enabled` from the
// create-response entirely yet serve PRF fine on a get(). So the
// create-response is treated as advisory only — whenever it lacks the
// output we follow up with a get() scoped to the credential we just made,
// and only that assertion's answer decides "unsupported".
export async function createIdentityWithPasskey(
  rpName = "Wavvon",
): Promise<{ seedHex: string; credentialId: string }> {
  if (!isPasskeySupported())
    throw new PrfUnsupportedError("creation", "Passkeys aren't supported in this browser.");

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

  const createOutput = extractPrfOutput(cred.getClientExtensionResults());

  // ALWAYS follow up with a get() scoped to the new credential, even when
  // create() already returned an output, for two reasons:
  // 1. Restore always goes through get(), so get()'s answer is the CANONICAL
  //    secret — deriving from a create-output that get() can't reproduce
  //    would mint an identity that no device can ever restore.
  // 2. It is the recovery self-test that gates creation. Windows Hello
  //    (observed on Win 11 25H2 build 26200.8655, 2026-07-18) evaluates PRF
  //    at create but errors on every PRF-carrying get() — an identity
  //    minted there would look passkey-backed while the passkey can never
  //    restore it. A passkey identity that can't restore-by-passkey is a
  //    decoy (user ruling, 2026-07-18), so creation is REFUSED rather than
  //    warned about; the user is routed to the recovery-phrase flow.
  try {
    const output = await requestPrfViaAssertion(salt, [{ id: cred.rawId, type: "public-key" }]);
    return { seedHex: prfOutputToSeedHex(output), credentialId: cred.id };
  } catch (e) {
    // A broken platform (Windows Hello) fails this ceremony with the SAME
    // NotAllowedError a user-cancel produces — indistinguishable. Either
    // way the self-test didn't pass, so creation is refused; the message
    // invites a retry for the genuine-cancel case.
    if (createOutput) throw new PrfRestoreUnverifiedError();
    if (e instanceof PrfUnsupportedError) throw new PrfOutputUnavailableError();
    throw e;
  }
}

// Returning-user flow: a discoverable-credential assertion (no
// allowCredentials) re-derives the same identity entropy on any device where
// the user's passkey provider is signed in.
export async function restoreIdentityWithPasskey(): Promise<string> {
  if (!isPasskeySupported())
    throw new PrfUnsupportedError("creation", "Passkeys aren't supported in this browser.");
  const output = await requestPrfViaAssertion(prfSaltBytes());
  return prfOutputToSeedHex(output);
}
