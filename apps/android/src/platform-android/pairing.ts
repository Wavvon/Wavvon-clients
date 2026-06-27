import { ed25519 } from "@noble/curves/ed25519";
import { loadPairedState, savePairedState } from "../identity/store";
import type { SubkeyCert } from "../identity/store";

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

function writeU32LE(v: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = v & 0xff; b[1] = (v >> 8) & 0xff; b[2] = (v >> 16) & 0xff; b[3] = (v >> 24) & 0xff;
  return b;
}

function writeStr(s: string): Uint8Array {
  const bytes = new TextEncoder().encode(s);
  return concat(writeU32LE(bytes.length), bytes);
}

function buildClaimSigningBytes(pairingToken: string, subkeyPubkeyHex: string, deviceLabel: string): Uint8Array {
  const prefix = new TextEncoder().encode("wavvon/pairing-claim/v1\0");
  return concat(prefix, writeStr(pairingToken), writeStr(subkeyPubkeyHex), writeStr(deviceLabel));
}

export interface PairingOffer {
  master_pubkey: string;
  home_hubs: string[];
  pairing_token: string;
  issued_at: number;
  expires_at: number;
  signature: string;
}

export type PairingStatus =
  | { state: "pending" }
  | { state: "claimed"; subkey_pubkey: string; device_label: string }
  | { state: "complete"; cert: SubkeyCert; wrapped_blob_key_hex: string }
  | { state: "expired" };

async function pollStatus(homeHub: string, token: string): Promise<PairingStatus> {
  const res = await fetch(`${homeHub}/pairing/status/${token}`);
  if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
  return res.json() as Promise<PairingStatus>;
}

export async function claimPairingOffer(
  offerJson: string,
  deviceLabel: string,
  onStatusUpdate: (msg: string) => void,
): Promise<void> {
  const offer: PairingOffer = JSON.parse(offerJson);
  const homeHub = offer.home_hubs[0];
  if (!homeHub) throw new Error("No home hub in offer");

  const now = Math.floor(Date.now() / 1000);
  if (offer.expires_at <= now) throw new Error("Pairing offer has expired");

  onStatusUpdate("Generating device key…");
  const subkeyPrivate = ed25519.utils.randomPrivateKey();
  const subkeyPubkeyHex = bytesToHex(ed25519.getPublicKey(subkeyPrivate));

  const signingBytes = buildClaimSigningBytes(offer.pairing_token, subkeyPubkeyHex, deviceLabel);
  const proof = bytesToHex(ed25519.sign(signingBytes, subkeyPrivate));

  onStatusUpdate("Submitting claim…");
  const claimRes = await fetch(`${homeHub}/pairing/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pairing_token: offer.pairing_token,
      subkey_pubkey: subkeyPubkeyHex,
      device_label: deviceLabel,
      proof,
    }),
  });
  if (!claimRes.ok) {
    const msg = await claimRes.text().catch(() => String(claimRes.status));
    throw new Error(`Claim failed: ${msg}`);
  }

  onStatusUpdate("Waiting for confirmation on your other device…");

  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      pollStatus(homeHub, offer.pairing_token)
        .then(async (status) => {
          if (status.state === "complete") {
            clearInterval(interval);
            await savePairedState({
              subkey_private_hex: bytesToHex(subkeyPrivate),
              cert: status.cert,
            });
            onStatusUpdate("Paired! Restart the app to reconnect with your shared identity.");
            resolve();
          } else if (status.state === "expired") {
            clearInterval(interval);
            reject(new Error("Pairing offer expired before the other device confirmed."));
          }
        })
        .catch((e: unknown) => {
          console.warn("Poll error (retrying):", e);
        });
    }, 2000);
  });
}

export async function isPaired(): Promise<boolean> {
  const state = await loadPairedState();
  return state !== null;
}

export { hexToBytes, bytesToHex };
