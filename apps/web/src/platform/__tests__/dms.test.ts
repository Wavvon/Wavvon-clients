import { describe, it, expect } from "vitest";
import { publicKeyHex, dhKeypairFromSeed, bytesToHex } from "@wavvon/core";
import { resolveDmSendAttribution, canPublishDhKey, unreadableDmKey } from "../commands/dms";

// Cert-chained DM attribution / DH scalar selection (decisions.md
// "Paired-device DMs attribute to canonical via cert-chained envelopes; DH
// capability is a wrapped canonical scalar"). These test the pure
// paired-vs-unpaired decision extracted from sendDm/publishDhKey — no
// network involved.

const PRIMARY_SEED_HEX = bytesToHex(new Uint8Array(32).fill(1));
const PRIMARY_PUB = publicKeyHex(PRIMARY_SEED_HEX);

const SUBKEY_SEED_HEX = bytesToHex(new Uint8Array(32).fill(2));
const SUBKEY_PUB = publicKeyHex(SUBKEY_SEED_HEX);

const CANONICAL_DH_PRIV_HEX = bytesToHex(new Uint8Array(32).fill(3));

const SAMPLE_CERT = {
  master_pubkey: PRIMARY_PUB,
  subkey_pubkey: SUBKEY_PUB,
  device_label: "phone",
  issued_at: 1_700_000_000,
  not_after: null,
  fallback_hubs: [],
  signature: "deadbeef",
};

describe("resolveDmSendAttribution", () => {
  it("unpaired (primary) device: signs and sends as itself, no cert, seed-derived DH scalar", () => {
    const attribution = resolveDmSendAttribution({
      seed_hex: PRIMARY_SEED_HEX,
      canonical_pubkey: undefined,
      subkey_cert: undefined,
      canonical_dh_priv_hex: undefined,
    });

    expect(attribution.signingSeedHex).toBe(PRIMARY_SEED_HEX);
    expect(attribution.senderPubkey).toBe(PRIMARY_PUB);
    expect(attribution.signerCert).toBeUndefined();
    expect(bytesToHex(attribution.dhPriv)).toBe(bytesToHex(dhKeypairFromSeed(PRIMARY_SEED_HEX).dhPriv));
  });

  it("primary device that self-certified: canonical_pubkey equals its own pubkey, still no cert override needed for attribution to differ", () => {
    // A primary device that enabled multi-device gets canonical_pubkey ===
    // its own pubkey back from auth — attribution should be a no-op
    // (byte-identical to the unpaired case).
    const attribution = resolveDmSendAttribution({
      seed_hex: PRIMARY_SEED_HEX,
      canonical_pubkey: PRIMARY_PUB,
      subkey_cert: SAMPLE_CERT,
      canonical_dh_priv_hex: undefined,
    });

    expect(attribution.senderPubkey).toBe(PRIMARY_PUB);
    expect(bytesToHex(attribution.dhPriv)).toBe(bytesToHex(dhKeypairFromSeed(PRIMARY_SEED_HEX).dhPriv));
  });

  it("paired device: signs with its own subkey, attributes to canonical, uses the unwrapped DH scalar", () => {
    const attribution = resolveDmSendAttribution({
      seed_hex: SUBKEY_SEED_HEX,
      canonical_pubkey: PRIMARY_PUB,
      subkey_cert: SAMPLE_CERT,
      canonical_dh_priv_hex: CANONICAL_DH_PRIV_HEX,
    });

    expect(attribution.signingSeedHex).toBe(SUBKEY_SEED_HEX);
    expect(attribution.senderPubkey).toBe(PRIMARY_PUB);
    expect(attribution.signerCert).toEqual(SAMPLE_CERT);
    expect(bytesToHex(attribution.dhPriv)).toBe(CANONICAL_DH_PRIV_HEX);
    // Crucially NOT derived from the subkey's own seed.
    expect(bytesToHex(attribution.dhPriv)).not.toBe(bytesToHex(dhKeypairFromSeed(SUBKEY_SEED_HEX).dhPriv));
  });

  it("paired device without a wrapped DH scalar yet falls back to deriving from its own seed", () => {
    // Defensive fallback for an old pairing that predates wrapped_dh_seed_hex
    // — DM E2E degrades rather than crashing.
    const attribution = resolveDmSendAttribution({
      seed_hex: SUBKEY_SEED_HEX,
      canonical_pubkey: PRIMARY_PUB,
      subkey_cert: SAMPLE_CERT,
      canonical_dh_priv_hex: undefined,
    });

    expect(bytesToHex(attribution.dhPriv)).toBe(bytesToHex(dhKeypairFromSeed(SUBKEY_SEED_HEX).dhPriv));
  });
});

describe("canPublishDhKey (client-side publish guard)", () => {
  it("allows publish for an unpaired device (no canonical_pubkey yet)", () => {
    expect(canPublishDhKey({ seed_hex: PRIMARY_SEED_HEX, canonical_pubkey: undefined })).toBe(true);
  });

  it("allows publish when this device's own pubkey IS the canonical identity", () => {
    expect(canPublishDhKey({ seed_hex: PRIMARY_SEED_HEX, canonical_pubkey: PRIMARY_PUB })).toBe(true);
  });

  it("blocks publish for a paired device whose signing pubkey differs from canonical", () => {
    expect(canPublishDhKey({ seed_hex: SUBKEY_SEED_HEX, canonical_pubkey: PRIMARY_PUB })).toBe(false);
  });
});

describe("unreadableDmKey", () => {
  // The distinction this exists for: our own sent message is unreadable by
  // design (the ratchet consumed the key at encrypt time), and calling that
  // "decryption failed" reported a design limit as breakage every time
  // someone paired a second device.
  it("names our own sent message as ours rather than as a failure", () => {
    expect(unreadableDmKey(PRIMARY_PUB, PRIMARY_PUB)).toBe("dm.own_message_other_device");
  });

  it("still reports someone else's unreadable message as a failure", () => {
    expect(unreadableDmKey(SUBKEY_PUB, PRIMARY_PUB)).toBe("dm.decryption_failed");
  });

  // With no identity loaded there is nobody to be "us", and claiming a
  // stranger's message is our own would be the worse way to be wrong.
  it("falls back to failure when we do not know who we are", () => {
    expect(unreadableDmKey(PRIMARY_PUB, null)).toBe("dm.decryption_failed");
  });

  // A paired device is attributed to the canonical identity, so its own sent
  // messages come back under the canonical pubkey — which is exactly the
  // device that cannot read them.
  it("uses the canonical identity, so a paired device recognises its own", () => {
    const paired = resolveDmSendAttribution({
      seed_hex: SUBKEY_SEED_HEX,
      canonical_pubkey: PRIMARY_PUB,
      subkey_cert: undefined,
      canonical_dh_priv_hex: undefined,
    });
    expect(unreadableDmKey(PRIMARY_PUB, paired.senderPubkey)).toBe("dm.own_message_other_device");
  });
});
