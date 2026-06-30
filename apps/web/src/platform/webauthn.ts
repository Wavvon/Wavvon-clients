// WebAuthn / passkey flows for the web client.
// Requires a browser that supports navigator.credentials (PublicKeyCredential).
// Used for: registering a new passkey, authenticating with an existing one,
// and managing credentials/trusted devices via the hub API.

import { hubFetch, rawFetch } from "./http";

export interface CredentialInfo {
  id: string;
  friendly_name: string | null;
  aaguid: string | null;
  created_at: number;
  last_used_at: number | null;
}

export interface DeviceInfo {
  id: string;
  device_name: string | null;
  created_at: number;
  expires_at: number;
  last_used_at: number | null;
}

export function isPasskeySupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

// --- base64url <-> ArrayBuffer ---

function b64urlToBuffer(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "==".slice(0, (4 - (b64.length % 4)) % 4);
  const bin = atob(b64 + padding);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function bufferToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// --- Passkey registration ---

// Register a new passkey for the currently authenticated user.
// `userPubkey` is the Ed25519 public key hex (the user's Wavvon identity).
// `friendlyName` is stored in the hub and shown in the passkey list.
export async function registerPasskey(
  userPubkey: string,
  displayName?: string,
  friendlyName?: string,
): Promise<void> {
  const begin = await hubFetch("/auth/webauthn/begin", {
    method: "POST",
    body: JSON.stringify({
      user_pubkey: userPubkey,
      display_name: displayName ?? null,
    }),
  }).then((r) => r.json() as Promise<{ session_id: string; options: Record<string, unknown> }>);

  const raw = begin.options;

  const pubKeyOptions: PublicKeyCredentialCreationOptions = {
    ...(raw as object),
    challenge: b64urlToBuffer(raw.challenge as string),
    user: {
      ...(raw.user as object),
      id: b64urlToBuffer((raw.user as Record<string, string>).id),
    },
    excludeCredentials: (
      (raw.excludeCredentials as Array<Record<string, string>>) ?? []
    ).map((c) => ({ ...c, id: b64urlToBuffer(c.id) })),
  } as PublicKeyCredentialCreationOptions;

  let cred: PublicKeyCredential;
  try {
    const result = await navigator.credentials.create({ publicKey: pubKeyOptions });
    if (!result) throw new Error("No credential returned by authenticator");
    cred = result as PublicKeyCredential;
  } catch (e) {
    if (e instanceof DOMException) {
      if (e.name === "NotAllowedError") throw new Error("Passkey creation was cancelled");
      if (e.name === "SecurityError")
        throw new Error(
          "Passkeys require the app to be served from the hub's domain. Open the hub URL directly in your browser.",
        );
    }
    throw e;
  }

  const resp = cred.response as AuthenticatorAttestationResponse;

  await hubFetch("/auth/webauthn/finish", {
    method: "POST",
    body: JSON.stringify({
      session_id: begin.session_id,
      credential: {
        id: cred.id,
        rawId: bufferToB64url(cred.rawId),
        type: cred.type,
        response: {
          clientDataJSON: bufferToB64url(resp.clientDataJSON),
          attestationObject: bufferToB64url(resp.attestationObject),
        },
      },
      friendly_name: friendlyName ?? null,
    }),
  });
}

// --- Passkey authentication (unauthenticated — call before addHub) ---

// Authenticate with a registered passkey and return a session token.
// Pass the returned token as opts.sessionToken to addHub() to skip Ed25519 auth.
export async function authenticateWithPasskey(
  hubUrl: string,
  userPubkey: string,
): Promise<string> {
  const hub = hubUrl.replace(/\/$/, "");

  const beginRes = await rawFetch(`${hub}/auth/webauthn/assert/begin`, {
    method: "POST",
    body: JSON.stringify({ user_pubkey: userPubkey }),
  });
  if (!beginRes.ok)
    throw new Error(`Passkey auth begin failed (${beginRes.status})`);

  const begin = (await beginRes.json()) as {
    session_id: string;
    options: Record<string, unknown>;
  };

  const raw = begin.options;

  const pubKeyOptions: PublicKeyCredentialRequestOptions = {
    ...(raw as object),
    challenge: b64urlToBuffer(raw.challenge as string),
    allowCredentials: (
      (raw.allowCredentials as Array<Record<string, string>>) ?? []
    ).map((c) => ({ ...c, id: b64urlToBuffer(c.id) })),
  } as PublicKeyCredentialRequestOptions;

  let cred: PublicKeyCredential;
  try {
    const result = await navigator.credentials.get({ publicKey: pubKeyOptions });
    if (!result) throw new Error("No credential returned by authenticator");
    cred = result as PublicKeyCredential;
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotAllowedError")
      throw new Error("Passkey authentication was cancelled");
    throw e;
  }

  const resp = cred.response as AuthenticatorAssertionResponse;

  const finishRes = await rawFetch(`${hub}/auth/webauthn/assert/finish`, {
    method: "POST",
    body: JSON.stringify({
      session_id: begin.session_id,
      credential: {
        id: cred.id,
        rawId: bufferToB64url(cred.rawId),
        type: cred.type,
        response: {
          clientDataJSON: bufferToB64url(resp.clientDataJSON),
          authenticatorData: bufferToB64url(resp.authenticatorData),
          signature: bufferToB64url(resp.signature),
          userHandle: resp.userHandle ? bufferToB64url(resp.userHandle) : null,
        },
      },
    }),
  });
  if (!finishRes.ok)
    throw new Error(`Passkey auth finish failed (${finishRes.status})`);

  const { session_token } = (await finishRes.json()) as { session_token: string };
  return session_token;
}

// --- Passkey management (requires active authenticated session) ---

export async function listPasskeys(): Promise<CredentialInfo[]> {
  return hubFetch("/me/credentials").then((r) => r.json() as Promise<CredentialInfo[]>);
}

export async function deletePasskey(credentialId: string): Promise<void> {
  await hubFetch(`/me/credentials/${encodeURIComponent(credentialId)}`, {
    method: "DELETE",
  });
}

export async function renamePasskey(credentialId: string, name: string): Promise<void> {
  await hubFetch(`/me/credentials/${encodeURIComponent(credentialId)}`, {
    method: "PATCH",
    body: JSON.stringify({ friendly_name: name }),
  });
}

// --- Trusted device management ---

export async function listTrustedDevices(): Promise<DeviceInfo[]> {
  return hubFetch("/me/devices").then((r) => r.json() as Promise<DeviceInfo[]>);
}

export async function revokeTrustedDevice(deviceId: string): Promise<void> {
  await hubFetch(`/me/devices/${encodeURIComponent(deviceId)}`, {
    method: "DELETE",
  });
}
