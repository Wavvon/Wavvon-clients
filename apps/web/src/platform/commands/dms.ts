import { hexToBytes, bytesToHex } from "@wavvon/core";
import { hubFetch, rawFetch } from "../http";
import { activeSession } from "../session";
import { loadIdentity } from "../../identity/store";
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
  type DmEnvelope,
  type DRSession,
  type DrEnvelope,
} from "@wavvon/core";
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
  encrypted_envelope?: DmEnvelope | DrEnvelope;
  group_encrypted_envelope?: unknown;
  delivery_failed?: boolean;
}

function loadDrSession(convId: string): DRSession | null {
  try {
    const raw = localStorage.getItem(`wavvon_dr_${convId}`);
    return raw ? (JSON.parse(raw) as DRSession) : null;
  } catch {
    return null;
  }
}

function saveDrSession(convId: string, session: DRSession): void {
  localStorage.setItem(`wavvon_dr_${convId}`, JSON.stringify(session));
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
  const { dhPriv } = identity
    ? dhKeypairFromSeed(identity.seed_hex)
    : { dhPriv: null };

  const results: DmMessageFull[] = [];
  for (const m of raw) {
    let content = m.content ?? "";
    if (m.is_encrypted && m.encrypted_envelope) {
      const env = m.encrypted_envelope;
      if ((env as DrEnvelope).v === 2 && identitySeed) {
        try {
          const senderDhPubHex = await fetchDhKey(m.sender) ?? "";
          const session = loadDrSession(m.conversation_id) ?? emptyDrSession();
          const { plaintext, updatedSession } = decryptDmDr(
            env as DrEnvelope,
            session,
            identitySeed,
            senderDhPubHex,
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

  const seedHex = identity.seed_hex;
  const members = await getConversationMembers(conversation_id);
  const myPubkey = publicKeyHex(seedHex);
  const recipientPubkey = members.find((m) => m !== myPubkey);

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
    drSession = initDrSession(conversation_id, seedHex, recipientDhPubHex);
  }
  const { envelope: drEnvelope, updatedSession } = encryptDmDr(
    conversation_id,
    content,
    drSession,
    seedHex,
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

export async function publishDhKey(): Promise<void> {
  const identity = await loadIdentity();
  if (!identity) throw new Error("No identity");

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
