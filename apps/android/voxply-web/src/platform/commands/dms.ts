import { hexToBytes } from "@voxply/utils";
import { hubFetch, rawFetch } from "../http";
import { activeSession, getSession } from "../session";
import { loadIdentity } from "../../identity/store";
import {
  dhKeypairFromSeed,
  encryptDm,
  decryptDm,
  signBytes,
  publicKeyHex,
  dhKeySigningBytes,
  type DmEnvelope,
} from "../../identity/crypto";
import type { Conversation, DmMessage, DmMessageFull, Attachment } from "@shared/types";

export async function listConversations(): Promise<Conversation[]> {
  const res = await hubFetch("/conversations");
  return res.json() as Promise<Conversation[]>;
}

export async function createConversation(member_pubkeys: string[]): Promise<Conversation> {
  const res = await hubFetch("/conversations", {
    method: "POST",
    body: JSON.stringify({ member_pubkeys }),
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
  encrypted_envelope?: DmEnvelope;
  delivery_failed?: boolean;
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
  const { dhPriv } = identity
    ? dhKeypairFromSeed(identity.seed_hex)
    : { dhPriv: null };

  return raw.map((m): DmMessageFull => {
    let content = m.content ?? "";
    if (m.is_encrypted && m.encrypted_envelope && dhPriv) {
      try {
        content = decryptDm(conversation_id, m.encrypted_envelope, dhPriv);
      } catch {
        content = "[decryption failed]";
      }
    }
    return {
      id: m.id,
      conversation_id: m.conversation_id,
      sender: m.sender,
      sender_name: m.sender_name,
      content,
      created_at: m.created_at,
      attachments: m.attachments,
      is_encrypted: m.is_encrypted,
      delivery_failed: m.delivery_failed,
    };
  });
}

export async function sendDm(
  conversation_id: string,
  content: string,
  attachments?: Attachment[],
): Promise<void> {
  const identity = await loadIdentity();
  if (!identity) throw new Error("No identity");

  const { dhPriv } = dhKeypairFromSeed(identity.seed_hex);
  const members = await getConversationMembers(conversation_id);
  const myPubkey = publicKeyHex(identity.seed_hex);
  const recipientPubkey = members.find((m) => m !== myPubkey);

  if (!recipientPubkey) {
    // Group DM or self-conversation — send plaintext
    await hubFetch(`/conversations/${conversation_id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, attachments }),
    });
    return;
  }

  const recipientDhHex = await fetchDhKey(recipientPubkey);
  if (!recipientDhHex) {
    // Recipient has no DH key — send plaintext
    await hubFetch(`/conversations/${conversation_id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, attachments }),
    });
    return;
  }

  const recipientDhPub = hexToBytes(recipientDhHex);
  const envelope = encryptDm(
    conversation_id,
    content,
    recipientDhPub,
    dhPriv,
    hexToBytes(identity.seed_hex),
  );

  await hubFetch(`/conversations/${conversation_id}/messages`, {
    method: "POST",
    body: JSON.stringify({ encrypted_envelope: envelope, attachments }),
  });
}

async function getConversationMembers(conversation_id: string): Promise<string[]> {
  const res = await hubFetch(`/conversations/${conversation_id}`);
  const conv = (await res.json()) as Conversation;
  return conv.members;
}

// Fetch a user's published DH public key from their home hub.
// Returns null if the user hasn't published one.
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

// Publish our own DH public key to the active hub.
export async function publishDhKey(): Promise<void> {
  const identity = await loadIdentity();
  if (!identity) throw new Error("No identity");

  const seedHex = identity.seed_hex;
  const myPubkeyHex = publicKeyHex(seedHex);
  const { dhPub } = dhKeypairFromSeed(seedHex);
  const dhPubkeyHex = Array.from(dhPub, (b) => b.toString(16).padStart(2, "0")).join("");

  const sigMsg = dhKeySigningBytes(myPubkeyHex, dhPubkeyHex);
  const signatureHex = signBytes(sigMsg, seedHex);

  await hubFetch(`/identity/${myPubkeyHex}/dh-key`, {
    method: "PUT",
    body: JSON.stringify({ dh_pubkey_hex: dhPubkeyHex, signature_hex: signatureHex }),
  });
}
