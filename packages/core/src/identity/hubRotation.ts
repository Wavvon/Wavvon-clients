import { ed25519 } from "@noble/curves/ed25519";
import { hexToBytes } from "../hex";

/**
 * The separator between the three fields the hub joins before signing. Part
 * of the format, not a formatting choice: change it here and every
 * endorsement a hub ever signed stops verifying.
 */
const ROTATION_FIELD_SEPARATOR = ":";

/**
 * A hub's signed endorsement of its own new identity key.
 *
 * A hub's public key *is* its name: a client stores a hub under it, and a
 * federating peer trusts it. Rotating that key therefore renames the hub in
 * the network's namespace, and this payload is what stops the rename reading
 * as "a stranger turned up at the same address" — the **old** key signs the
 * handover, so anybody who already trusted the old key can follow it forward
 * with no out-of-band channel.
 *
 * Served at `GET /key-rotation` and carried on `/info.rotation` while the
 * transition window is open.
 */
export interface HubKeyRotation {
  old_pubkey: string;
  new_pubkey: string;
  effective_at: number;
  signature: string;
}

/**
 * The bytes the hub signs: `"<old>:<new>:<effective_at>"`, UTF-8, no tag and
 * no length prefixes.
 *
 * This one predates the versioned-envelope convention the rest of the wire
 * format follows (`b"wavvon/<name>/v1\0"` plus length-prefixed fields), and
 * it is mirrored here exactly as the hub writes it in `rotate_hub_key`
 * — matching the bytes is the contract, not agreeing they are the nicer
 * shape.
 */
export function hubRotationSigningBytes(
  oldPubkey: string,
  newPubkey: string,
  effectiveAt: number,
): Uint8Array {
  return new TextEncoder().encode(
    [oldPubkey, newPubkey, effectiveAt].join(ROTATION_FIELD_SEPARATOR),
  );
}

/**
 * True when this endorsement really was signed by the key it claims to be
 * leaving behind.
 *
 * Verified against `old_pubkey` — which only means anything when the caller
 * already trusts that key, i.e. it is the key a hub is *currently* stored
 * under. Verifying it against a key we have never seen proves nothing: anyone
 * can generate two keypairs and have one endorse the other. The binding is
 * the caller's job and `followsHub` below is what does it.
 */
export function verifyHubRotation(rotation: HubKeyRotation): boolean {
  try {
    if (!rotation.old_pubkey || !rotation.new_pubkey || !rotation.signature) return false;
    if (rotation.old_pubkey === rotation.new_pubkey) return false;
    const msg = hubRotationSigningBytes(
      rotation.old_pubkey,
      rotation.new_pubkey,
      rotation.effective_at,
    );
    return ed25519.verify(hexToBytes(rotation.signature), msg, hexToBytes(rotation.old_pubkey));
  } catch {
    return false;
  }
}

/**
 * Whether `rotation` is a hub we hold under `knownPubkey` telling us it has
 * become `rotation.new_pubkey`.
 *
 * The two questions are separate on purpose: the signature says the handover
 * is genuine, and this says the handover is *ours*. A valid endorsement
 * between two keys we have never met is somebody else's business, and a hub
 * presenting a different key with no endorsement at all is a different hub —
 * which is exactly the case worth refusing rather than silently adopting.
 */
export function rotationAppliesTo(
  rotation: HubKeyRotation | null | undefined,
  knownPubkey: string,
): rotation is HubKeyRotation {
  if (!rotation) return false;
  if (rotation.old_pubkey !== knownPubkey) return false;
  return verifyHubRotation(rotation);
}
