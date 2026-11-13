import {
  bytesToHex,
  hexToBytes,
  decryptGroupMessage,
  encryptGroupMessage,
  groupEnvelopeSigningBytes,
  publicKeyHex,
  senderKeyDistSigningBytes,
  signBytes,
  unwrapGroupChainKey,
  wrapGroupChainKey,
  type DmPlaintext,
  type GroupEnvelope,
} from "@wavvon/core";
import type { Attachment, Conversation } from "@shared/types";
import { dmFetch } from "../dmHub";
import { getScoped, setScoped } from "../../utils/accountScope";
import { loadIdentity } from "../../identity/store";
import { lookupDhKey, resolveDmSendAttribution } from "./dms";

// Group DM sender keys (e2e-encryption.md "Group DMs — v2"), the web side of
// what the desktop shell does in dm.rs. One chain per (conversation, sender,
// version); ours is advanced on every send, a peer's is held at the iteration
// it was handed over at and never advanced, so history decrypts in any order.

interface ChainState {
  version: number;
  chain_key_hex: string;
  iteration: number;
}

const mineKey = (convId: string) => `wavvon_gsk_mine_${convId}`;
// Per version, unlike desktop: a rotation leaves the messages before it readable.
const peerKey = (convId: string, sender: string, version: number) => `wavvon_gsk_peer_${convId}_${sender}_${version}`;

function load(key: string): ChainState | null {
  try {
    const raw = getScoped(key);
    return raw ? (JSON.parse(raw) as ChainState) : null;
  } catch {
    return null;
  }
}

function store(key: string, state: ChainState): void {
  setScoped(key, JSON.stringify(state));
}

function freshChain(version: number): ChainState {
  return { version, chain_key_hex: bytesToHex(crypto.getRandomValues(new Uint8Array(32))), iteration: 0 };
}

async function attribution() {
  const identity = await loadIdentity();
  if (!identity) throw new Error("No identity");
  const a = resolveDmSendAttribution(identity);
  const asSelf = publicKeyHex(a.signingSeedHex) === a.senderPubkey;
  return { ...a, signerCert: asSelf ? undefined : a.signerCert };
}

/** Wrap `chain` for every other member and publish it, then adopt it as ours.
 *  A member with no published key, or one whose key changed and was not
 *  accepted, gets none and cannot read what follows: the same rule desktop
 *  applies, and never a plaintext fallback. */
async function distribute(conv: Conversation, chain: ChainState): Promise<void> {
  const { signingSeedHex, senderPubkey, signerCert, dhPriv } = await attribution();
  const chainKey = hexToBytes(chain.chain_key_hex);
  const recipients: { recipient_pubkey: string; wrapped_key_hex: string; wrap_nonce_hex: string; iteration: number }[] = [];
  for (const member of conv.members) {
    if (member === senderPubkey) continue;
    let dh: string | null = null;
    try {
      dh = await lookupDhKey(member);
    } catch {
      continue;
    }
    if (!dh) continue;
    const w = wrapGroupChainKey(dhPriv, hexToBytes(dh), conv.id, chainKey, chain.iteration);
    recipients.push({ recipient_pubkey: member, wrapped_key_hex: w.wrappedHex, wrap_nonce_hex: w.nonceHex, iteration: chain.iteration });
  }
  const signed = senderKeyDistSigningBytes(conv.id, chain.version, recipients.map((r) => [r.recipient_pubkey, r.wrapped_key_hex]));
  await dmFetch(`/conversations/${conv.id}/sender-keys`, {
    method: "PUT",
    body: JSON.stringify({
      sender_pubkey: senderPubkey,
      sender_key_version: chain.version,
      iteration: chain.iteration,
      recipients,
      signature_hex: signBytes(signed, signingSeedHex),
      ...(signerCert ? { signer_cert: signerCert } : {}),
    }),
  });
  store(mineKey(conv.id), chain);
}

/** A fresh chain for the membership as it is now. Run on every membership
 *  change: a removed member must not read what comes next, and an added one
 *  needs a key at all. */
export async function rotateGroupSenderKey(conv: Conversation): Promise<void> {
  await distribute(conv, freshChain((load(mineKey(conv.id))?.version ?? 0) + 1));
}

export async function encryptGroupDm(
  conv: Conversation,
  content: string,
  attachments?: Attachment[],
): Promise<GroupEnvelope> {
  let mine = load(mineKey(conv.id));
  if (!mine) {
    mine = freshChain(1);
    await distribute(conv, mine);
  }
  const { signingSeedHex, senderPubkey, signerCert } = await attribution();
  const { ciphertextHex, nonceHex, nextChainKey } = encryptGroupMessage(
    hexToBytes(mine.chain_key_hex), mine.iteration, { content, attachments },
  );
  // Advanced before the send: a key used twice is worse than a message lost.
  store(mineKey(conv.id), { version: mine.version, chain_key_hex: bytesToHex(nextChainKey), iteration: mine.iteration + 1 });
  const env: GroupEnvelope = {
    sender_pubkey: senderPubkey,
    conv_id: conv.id,
    sender_key_version: mine.version,
    iteration: mine.iteration,
    ciphertext_hex: ciphertextHex,
    nonce_hex: nonceHex,
    signature_hex: signBytes(
      groupEnvelopeSigningBytes(conv.id, mine.version, mine.iteration, ciphertextHex, nonceHex),
      signingSeedHex,
    ),
  };
  if (signerCert) env.signer_cert = signerCert;
  return env;
}

interface SenderKeyEntry {
  sender_pubkey: string;
  sender_key_version: number;
  wrapped_key_hex: string;
  wrap_nonce_hex: string;
}

/** Take every peer chain the hub holds for us in this conversation. A key
 *  that will not unwrap, or whose sender's DH key is missing or changed, is
 *  skipped: its messages stay unreadable rather than trusted. */
export async function fetchGroupSenderKeys(convId: string): Promise<void> {
  const { dhPriv } = await attribution();
  const entries = (await (await dmFetch(`/conversations/${convId}/sender-keys`)).json()) as SenderKeyEntry[];
  for (const e of entries) {
    const key = peerKey(convId, e.sender_pubkey, e.sender_key_version);
    if (load(key)) continue;
    let dh: string | null = null;
    try {
      dh = await lookupDhKey(e.sender_pubkey);
    } catch {
      continue;
    }
    if (!dh) continue;
    try {
      const { chainKey, iteration } = unwrapGroupChainKey(dhPriv, hexToBytes(dh), convId, e.wrapped_key_hex, e.wrap_nonce_hex);
      store(key, { version: e.sender_key_version, chain_key_hex: bytesToHex(chainKey), iteration });
    } catch {
      continue;
    }
  }
}

export function holdsGroupKey(env: GroupEnvelope): boolean {
  return load(peerKey(env.conv_id, env.sender_pubkey, env.sender_key_version)) !== null;
}

/** Throws when no key is held or the message does not open. */
export function decryptGroupDm(env: GroupEnvelope): DmPlaintext {
  const held = load(peerKey(env.conv_id, env.sender_pubkey, env.sender_key_version));
  if (!held) throw new Error("key_not_found");
  return decryptGroupMessage(hexToBytes(held.chain_key_hex), held.iteration, env.iteration, env.ciphertext_hex, env.nonce_hex);
}
