import { hexToBytes, bytesToHex, voiceKeyWrap, voiceKeyUnwrap } from "@wavvon/core";

// E2E sender-key exchange for voice-transport-v2 (docs/docs/voice-transport-v2.md
// "E2E key distribution"). Wraps the core voiceKeyWrap/voiceKeyUnwrap
// primitives with the join/receive/request/rotate lifecycle and a bounded
// per-sender key-generation store; the crypto itself lives in
// packages/core/src/identity/voice.ts and is not reimplemented here.

export interface VoiceKeyBundle {
  recipient_pubkey: string;
  ciphertext_hex: string;
  nonce_hex: string;
}

export interface OwnVoiceKey {
  key: Uint8Array;
  salt: Uint8Array;
  keyId: number;
  ctr: bigint;
}

export interface RemoteVoiceKey {
  key: Uint8Array;
  salt: Uint8Array;
}

function freshKey(keyId: number): OwnVoiceKey {
  return {
    key: crypto.getRandomValues(new Uint8Array(32)),
    salt: crypto.getRandomValues(new Uint8Array(4)),
    keyId,
    ctr: 0n,
  };
}

/** Keeps the last 2 key generations per sender pubkey — rides out a
 *  rotation race where a re-offer arrives after a packet already sealed
 *  under the new key (voice-transport-v2.md "AEAD"). */
export class VoiceKeyManager {
  private own: OwnVoiceKey = freshKey(1);
  private remote = new Map<string, Map<number, RemoteVoiceKey>>();

  /** `ownDhPriv`: the DH scalar behind the DH key published under OUR
   *  roster pubkey — `resolveDmSendAttribution(identity).dhPriv`. On a
   *  paired device that's the unwrapped canonical scalar (multi-device.md
   *  "Mechanism A"); deriving from `ownSeedHex` there would use an X25519
   *  key peers can't reconstruct (they fetch our published DH key by
   *  roster pubkey). Omitted = derive from the seed (single-key account). */
  constructor(
    private channelId: string,
    private ownSeedHex: string,
    private fetchDhKey: (pubkey: string) => Promise<string | null>,
    private ownDhPriv?: Uint8Array,
  ) {}

  ownKey(): OwnVoiceKey {
    return this.own;
  }

  private async wrapForRecipient(recipientPubkey: string): Promise<VoiceKeyBundle | null> {
    const recipientDhHex = await this.fetchDhKey(recipientPubkey);
    if (!recipientDhHex) return null;
    const { ciphertext, nonce } = voiceKeyWrap(
      hexToBytes(this.ownSeedHex),
      hexToBytes(recipientDhHex),
      this.channelId,
      this.own.key,
      this.own.salt,
      this.own.keyId,
      undefined,
      this.ownDhPriv,
    );
    return {
      recipient_pubkey: recipientPubkey,
      ciphertext_hex: bytesToHex(ciphertext),
      nonce_hex: bytesToHex(nonce),
    };
  }

  /** Builds one bundle per recipient for the current own key — used for the
   *  join-time offer (all other participants) and for a leave-triggered
   *  rotation re-offer alike. Recipients whose DH key can't be fetched are
   *  dropped rather than failing the whole offer. */
  async buildOffer(recipientPubkeys: string[]): Promise<VoiceKeyBundle[]> {
    const bundles = await Promise.all(recipientPubkeys.map((pk) => this.wrapForRecipient(pk)));
    return bundles.filter((b): b is VoiceKeyBundle => b !== null);
  }

  /** `voice_key_received` — unwrap with the claimed sender's DH pubkey
   *  (static-static DH is the implicit authentication; see the spec) and
   *  store under `(fromPubkey, keyId)`, trimmed to 2 generations. Silently
   *  no-ops if the sender's DH key can't be resolved or unwrap fails. */
  async receiveKey(fromPubkey: string, ciphertextHex: string, nonceHex: string): Promise<void> {
    const senderDhHex = await this.fetchDhKey(fromPubkey);
    if (!senderDhHex) return;
    let unwrapped: { senderKey: Uint8Array; nonceSalt: Uint8Array; keyId: number };
    try {
      unwrapped = voiceKeyUnwrap(
        hexToBytes(this.ownSeedHex),
        hexToBytes(senderDhHex),
        this.channelId,
        hexToBytes(ciphertextHex),
        hexToBytes(nonceHex),
        this.ownDhPriv,
      );
    } catch {
      return;
    }
    let gens = this.remote.get(fromPubkey);
    if (!gens) {
      gens = new Map();
      this.remote.set(fromPubkey, gens);
    }
    gens.set(unwrapped.keyId, { key: unwrapped.senderKey, salt: unwrapped.nonceSalt });
    while (gens.size > 2) {
      const oldest = Math.min(...gens.keys());
      gens.delete(oldest);
    }
  }

  lookupKey(senderPubkey: string, keyId: number): RemoteVoiceKey | null {
    return this.remote.get(senderPubkey)?.get(keyId) ?? null;
  }

  /** `voice_participant_left` — rotate to a fresh key/salt/ctr under the
   *  next key_id so the departed member's cached key can never decrypt
   *  future audio, and build the re-offer bundles for whoever remains. */
  async rotate(remainingPubkeys: string[]): Promise<VoiceKeyBundle[]> {
    this.own = freshKey(this.own.keyId + 1);
    return this.buildOffer(remainingPubkeys);
  }
}
