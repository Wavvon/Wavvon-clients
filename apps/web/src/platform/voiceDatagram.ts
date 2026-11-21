// Downlink datagram framing + replay guard for voice-transport-v2
// (docs/docs/voice-transport-v2.md "Datagram wire format" / "AEAD"). Pure
// and dependency-free so it's unit-testable without a real data channel.

export interface DownlinkFrame {
  senderId: number;
  packetType: number;
  /** The uplink packet (`voicePacketSeal` output) unchanged. */
  sealed: Uint8Array;
}

/** Parses `[sender_id: u16 BE][packet_type: u8][sealed packet]`. Returns
 *  null on a too-short datagram or an unrecognized packet_type — both are
 *  silently dropped by callers, same as an unknown-key packet. */
export function parseDownlinkDatagram(data: Uint8Array): DownlinkFrame | null {
  if (data.length < 3) return null;
  const packetType = data[2];
  if (packetType !== 0x00 && packetType !== 0x01) return null;
  return {
    senderId: (data[0] << 8) | data[1],
    packetType,
    sealed: data.slice(3),
  };
}

/** Reads the cleartext `key_id` (first 4 bytes BE) out of a sealed packet
 *  without decrypting it, so the caller can pick the matching key
 *  generation before calling `voicePacketOpen`. */
export function peekSealedKeyId(sealed: Uint8Array): number {
  if (sealed.length < 4) throw new Error("sealed voice packet too short to hold a key_id");
  return (sealed[0] << 24 | sealed[1] << 16 | sealed[2] << 8 | sealed[3]) >>> 0;
}

/** Per-`(sender_id, key_id)` highest-`ctr` watermark (voice-transport-v2.md
 *  "AEAD": drop `ctr` at-or-below the watermark, small reorder window
 *  allowed, first packet under a key always accepted). */
export class ReplayGuard {
  private watermarks = new Map<string, bigint>();

  accept(senderId: number, keyId: number, ctr: bigint): boolean {
    const k = `${senderId}:${keyId}`;
    const prev = this.watermarks.get(k);
    if (prev !== undefined && ctr <= prev) return false;
    this.watermarks.set(k, ctr);
    return true;
  }
}
