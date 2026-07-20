import { hexToBytes, bytesToHex } from "@wavvon/core";
import { hubFetch, rawFetch } from "../http";
import { activeSession } from "../session";
import { loadIdentity } from "../../identity/store";
import type { IdentityRecord } from "../../identity/store";
import { getScoped, setScoped } from "../../utils/accountScope";
import {
  dhKeypairFromSeed,
  encryptDm,
  decryptDm,
  encryptDmDr,
  decryptDmDr,
  initDrSession,
  signBytes,
  publicKeyHex,
  dhKeySigningBytes,
  verifyDmEnvelopeSigner,
  type DmEnvelope,
  type DRSession,
  type DrEnvelope,
  type SubkeyCert,
} from "@wavvon/core";
import type { Conversation, DmMessage, DmMessageFull, Attachment } from "@shared/types";

// ---------------------------------------------------------------------------
// Cert-chained DM attribution (decisions.md "Paired-device DMs attribute to
// canonical via cert-chained envelopes; DH capability is a wrapped canonical
// scalar"). Pulled out as a pure function of the identity record so the
// paired-vs-unpaired decision is unit-testable without a network mock.
// ---------------------------------------------------------------------------

export interface DmSendAttribution {
  /** The seed this device actually signs with — always its own. */
  signingSeedHex: string;
  /** Always the canonical identity — what the envelope's sender_pubkey carries. */
  senderPubkey: string;
  /** Attached only when this device's signing key differs from the canonical
   *  identity (a paired device signing with its own subkey). */
  signerCert?: SubkeyCert;
  /** The DH scalar to use for key agreement: the unwrapped canonical scalar
   *  for a paired device, or derived from this device's own seed otherwise. */
  dhPriv: Uint8Array;
}

export function resolveDmSendAttribution(
  identity: Pick<IdentityRecord, "seed_hex" | "canonical_pubkey" | "subkey_cert" | "canonical_dh_priv_hex">,
): DmSendAttribution {
  const signingSeedHex = identity.seed_hex;
  const senderPubkey = identity.canonical_pubkey ?? publicKeyHex(signingSeedHex);
  const dhPriv = identity.canonical_dh_priv_hex
    ? hexToBytes(identity.canonical_dh_priv_hex)
    : dhKeypairFromSeed(signingSeedHex).dhPriv;
  return {
    signingSeedHex,
    senderPubkey,
    signerCert: identity.subkey_cert,
    dhPriv,
  };
}

export async function listConversations(): Promise<Conversation[]> {
  const res = await hubFetch("/conversations");
  return res.json() as Promise<Conversation[]>;
}

export async function createConversation(member_pubkeys: string[]): Promise<Conversation> {
  // Server contract (hub routes/dms/conversations.rs CreateConversationRequest)
  // names the field `members`.
  const res = await hubFetch("/conversations", {
    method: "POST",
    body: JSON.stringify({ members: member_pubkeys }),
  });
  return res.json() as Promise<Conversation>;
}

interface RawDmMessage {
  id: string;
  conversation_id: string;
  sender: string;
  sender_name: string | null;
  content: string | null;
  created_at: number;
  attachments?: Attachment[];
  is_encrypted?: boolean;
  encrypted_envelope?: DmEnvelope | DrEnvelope;
  group_encrypted_envelope?: unknown;
  delivery_failed?: boolean;
}

function loadDrSession(convId: string): DRSession | null {
  try {
    const raw = getScoped(`wavvon_dr_${convId}`);
    return raw ? (JSON.parse(raw) as DRSession) : null;
  } catch {
    return null;
  }
}

function saveDrSession(convId: string, session: DRSession): void {
  setScoped(`wavvon_dr_${convId}`, JSON.stringify(session));
}

function emptyDrSession(): DRSession {
  return {
    rk: "", cks: null, ckr: null,
    ns: 0, nr: 0, pn: 0,
    dhsPriv: "", dhsPub: "", dhr: null,
    mkskipped: {},
  };
}

export async function getDmMessages(
  conversation_id: string,
  before?: string,
  limit = 50,
): Promise<DmMessageFull[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);
  const res = await hubFetch(`/conversations/${conversation_id}/messages?${params}`);
  const raw = (await res.json()) as RawDmMessage[];

  const identity = await loadIdentity();
  const identitySeed = identity?.seed_hex ?? null;
  const dhPriv = identity ? resolveDmSendAttribution(identity).dhPriv : null;

  const results: DmMessageFull[] = [];
  for (const m of raw) {
    let content = m.content ?? "";
    if (m.is_encrypted && m.encrypted_envelope) {
      const env = m.encrypted_envelope;
      // Cert-chained attribution (decisions.md "Paired-device DMs attribute
      // to canonical via cert-chained envelopes"): no signer_cert is
      // trusted as-is (today's behavior); a signer_cert must verify its
      // two-link chain AND bind sender_pubkey to the conversation's
      // canonical member (m.sender, already resolved server-side) before
      // the envelope is used for key selection.
      const envelopeTrusted =
        !env.signer_cert || (verifyDmEnvelopeSigner(env) && env.sender_pubkey === m.sender);

      if (!envelopeTrusted) {
        content = "[decryption failed]";
      } else if ((env as DrEnvelope).v === 2 && identitySeed) {
        try {
          const senderDhPubHex = await fetchDhKey(m.sender) ?? "";
          const session = loadDrSession(m.conversation_id) ?? emptyDrSession();
          const { plaintext, updatedSession } = decryptDmDr(
            env as DrEnvelope,
            session,
            identitySeed,
            senderDhPubHex,
            dhPriv ?? undefined,
          );
          saveDrSession(m.conversation_id, updatedSession);
          content = plaintext;
        } catch {
          content = "[decryption failed]";
        }
      } else if (dhPriv) {
        try {
          content = decryptDm(m.conversation_id, env as DmEnvelope, dhPriv);
        } catch {
          content = "[decryption failed]";
        }
      }
    } else if (!m.content && m.group_encrypted_envelope) {
      content = "🔒 Encrypted message (upgrade client to read)";
    }
    results.push({
      id: m.id,
      conversation_id: m.conversation_id,
      sender: m.sender,
      sender_name: m.sender_name,
      content,
      created_at: m.created_at,
      attachments: m.attachments,
      is_encrypted: m.is_encrypted,
      delivery_failed: m.delivery_failed,
    });
  }
  return results;
}

export async function sendDm(
  conversation_id: string,
  content: string,
  attachments?: Attachment[],
): Promise<void> {
  const identity = await loadIdentity();
  if (!identity) throw new Error("No identity");

  const { signingSeedHex, senderPubkey, signerCert, dhPriv } = resolveDmSendAttribution(identity);
  const members = await getConversationMembers(conversation_id);
  // Conversation membership is keyed to the canonical pubkey, not this
  // device's own signing key — a paired device's subkey never appears in
  // it (see decisions.md "Paired-device DMs attribute to canonical via
  // cert-chained envelopes").
  const recipientPubkey = members.find((m) => m !== senderPubkey);

  if (!recipientPubkey) {
    await hubFetch(`/conversations/${conversation_id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, attachments }),
    });
    return;
  }

  const recipientDhPubHex = await fetchDhKey(recipientPubkey);
  if (!recipientDhPubHex) {
    await hubFetch(`/conversations/${conversation_id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, attachments }),
    });
    return;
  }

  let drSession = loadDrSession(conversation_id);
  if (!drSession) {
    drSession = initDrSession(conversation_id, signingSeedHex, recipientDhPubHex, dhPriv);
  }
  const { envelope: drEnvelope, updatedSession } = encryptDmDr(
    conversation_id,
    content,
    drSession,
    signingSeedHex,
    senderPubkey,
    signerCert,
  );
  saveDrSession(conversation_id, updatedSession);

  await hubFetch(`/conversations/${conversation_id}/messages`, {
    method: "POST",
    body: JSON.stringify({ encrypted_envelope: drEnvelope, attachments: attachments ?? [] }),
  });
}

async function getConversationMembers(conversation_id: string): Promise<string[]> {
  const res = await hubFetch(`/conversations/${conversation_id}`);
  const conv = (await res.json()) as Conversation;
  return conv.members;
}

const dhKeyCache = new Map<string, { hex: string; ts: number }>();
const DH_CACHE_TTL = 24 * 60 * 60 * 1000;

export async function fetchDhKey(
  pubkey: string,
  hub_url?: string,
): Promise<string | null> {
  const cached = dhKeyCache.get(pubkey);
  if (cached && Date.now() - cached.ts < DH_CACHE_TTL) return cached.hex;

  const base = hub_url ?? activeSession().hub_url;
  try {
    const res = await rawFetch(`${base}/identity/${pubkey}/dh-key`);
    const record = (await res.json()) as {
      dh_pubkey_hex: string;
      signature_hex: string;
    };
    dhKeyCache.set(pubkey, { hex: record.dh_pubkey_hex, ts: Date.now() });
    return record.dh_pubkey_hex;
  } catch {
    return null;
  }
}

/** Publish guard (decisions.md "DH capability via a wrapped canonical
 *  scalar"): only a device holding the canonical signing seed may publish —
 *  i.e. its own pubkey IS the canonical identity the hub attributes it to.
 *  A paired device (whose signing pubkey differs from canonical) must skip
 *  publish; the primary device already published the canonical DH key for
 *  this identity, and a paired device signing as itself would publish the
 *  wrong (non-canonical) DH key under the canonical pubkey's URL — it can't
 *  actually do so anyway (the hub verifies the record's signature against
 *  the canonical pubkey), but skipping client-side avoids a wasted round
 *  trip and a confusing rejection.
 */
export function canPublishDhKey(
  identity: Pick<IdentityRecord, "seed_hex" | "canonical_pubkey">,
): boolean {
  const myPubkeyHex = publicKeyHex(identity.seed_hex);
  return !identity.canonical_pubkey || identity.canonical_pubkey === myPubkeyHex;
}

export async function publishDhKey(): Promise<void> {
  const identity = await loadIdentity();
  if (!identity) throw new Error("No identity");
  if (!canPublishDhKey(identity)) return;

  const seedHex = identity.seed_hex;
  const myPubkeyHex = publicKeyHex(seedHex);
  const { dhPub } = dhKeypairFromSeed(seedHex);
  const dhPubkeyHex = bytesToHex(dhPub);

  const sigMsg = dhKeySigningBytes(myPubkeyHex, dhPubkeyHex);
  const signatureHex = signBytes(sigMsg, seedHex);

  await hubFetch(`/identity/${myPubkeyHex}/dh-key`, {
    method: "PUT",
    body: JSON.stringify({ dh_pubkey_hex: dhPubkeyHex, signature_hex: signatureHex }),
  });
}
