/**
 * What two devices compare while pairing: the first 8 bytes of the new
 * device's key, as `ab:cd:…`. The new device shows its own, the existing one
 * shows the claim's, and the user approves only when they match — otherwise a
 * hub relaying the offer could post a claim of its own and be handed a
 * master-signed cert and the wrapped DM key. Same format as the desktop
 * shell's `fingerprint_pubkey`.
 */
export function deviceFingerprint(pubkeyHex: string): string {
  return (pubkeyHex.toLowerCase().slice(0, 16).match(/../g) ?? []).join(":");
}
