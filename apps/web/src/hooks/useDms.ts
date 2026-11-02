import { useEffect, useRef, useState } from "react";
import { getDmMessages, sendDm, createConversation, getConversation, HubApiError } from "@platform";
import { readFileAsB64, type EncryptionWarning } from "@wavvon/ui";
import i18n from "@wavvon/i18n";
import { loadDmPeerNames, rememberDmPeerName } from "../utils/dmPeerNames";
import type { Attachment, Conversation, DmMessage } from "@shared/types";

// The hub's default inline cap. A DM's files travel base64 inside the
// message, so the hub has the final say; this only stops the client from
// reading something it will refuse anyway.
const DM_ATTACHMENTS_CAP_B64 = 3 * 1024 * 1024;

interface UseDmsParams {
  inputText: string;
  setInputText: (v: string) => void;
  /** Files waiting to go out with the next DM, inline and inside the envelope. */
  pendingAttachments: Attachment[];
  setPendingAttachments: (items: Attachment[]) => void;
  setUnreadDms: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  /** App-side navigation on entering a conversation (deselect channel, switch view). */
  onConversationSelected: () => void;
  showHubError: (msg: string) => void;
}

function toDmMessages(msgs: Awaited<ReturnType<typeof getDmMessages>>): DmMessage[] {
  return msgs.map((m) => ({
    id: m.id,
    sender: m.sender,
    sender_name: m.sender_name,
    content: m.content,
    timestamp: m.created_at,
    attachments: m.attachments,
    is_encrypted: m.is_encrypted,
    delivery_failed: m.delivery_failed,
  }));
}

// Conversations, per-conversation message log, and the DM WS arms.
// Encryption is transparent here — getDmMessages/sendDm handle it in the
// platform command layer.
export function useDms({
  inputText,
  setInputText,
  pendingAttachments,
  setPendingAttachments,
  setUnreadDms,
  onConversationSelected,
  showHubError,
}: UseDmsParams) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [peerNames, setPeerNames] = useState<Record<string, string>>(loadDmPeerNames);
  const [dmMessages, setDmMessages] = useState<Record<string, DmMessage[]>>({});
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [encryptionWarning, setEncryptionWarning] = useState<EncryptionWarning | null>(null);
  const selectedConvRef = useRef<Conversation | null>(null);
  useEffect(() => {
    selectedConvRef.current = selectedConversation;
  }, [selectedConversation]);

  async function handleSelectConversation(conv: Conversation) {
    setSelectedConversation(conv);
    onConversationSelected();
    setUnreadDms((prev) => { const n = { ...prev }; delete n[conv.id]; return n; });
    if (!dmMessages[conv.id]) {
      try {
        const msgs = await getDmMessages(conv.id);
        setDmMessages((prev) => ({ ...prev, [conv.id]: toDmMessages(msgs) }));
      } catch {}
    }
  }

  // The hub dedupes 1:1 DMs server-side (create_conversation returns the
  // existing conversation instead of a duplicate), so this is safe to call
  // even if a conversation with this member already exists locally.
  async function handleStartConversation(
    pubkey: string,
    via?: { hubUrl: string; masterPubkey: string; displayName?: string | null },
  ) {
    try {
      const conv = await createConversation([pubkey], via);
      if (via?.displayName) setPeerNames(rememberDmPeerName(pubkey, via.displayName));
      setConversations((prev) => prev.some((c) => c.id === conv.id)
        ? prev.map((c) => c.id === conv.id ? conv : c)
        : [conv, ...prev]);
      await handleSelectConversation(conv);
    } catch (e) {
      showHubError(e instanceof HubApiError ? e.message : String(e));
    }
  }

  // Resolved by whichever button the user presses in EncryptionWarningModal.
  // A pending ask is the only reason this hook holds a promise: sendDm needs
  // an answer, and the answer arrives from the render tree.
  function confirmUnencrypted(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      setEncryptionWarning({
        messageKey: "dm.encryption_warning.no_key",
        onConfirm: () => { setEncryptionWarning(null); resolve(true); },
        onCancel: () => { setEncryptionWarning(null); resolve(false); },
      });
    });
  }

  async function attachFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const next = [...pendingAttachments];
    let total = next.reduce((n, a) => n + a.data_b64.length, 0);
    for (const f of Array.from(files)) {
      try {
        const b64 = await readFileAsB64(f);
        if (total + b64.length > DM_ATTACHMENTS_CAP_B64) {
          showHubError(i18n.t("errors.attachments_cap", { size: (total / 1_000_000).toFixed(1) }));
          break;
        }
        total += b64.length;
        next.push({ name: f.name, mime: f.type || "application/octet-stream", data_b64: b64 });
      } catch (e) {
        showHubError(String(e));
      }
    }
    setPendingAttachments(next);
  }

  async function handleSendDm() {
    if (!selectedConversation || (!inputText.trim() && pendingAttachments.length === 0)) return;
    const text = inputText.trim();
    const convId = selectedConversation.id;
    const attachments = pendingAttachments.length > 0 ? pendingAttachments : undefined;
    try {
      // Clearing the composer is now the last step, not the first: a send
      // that is refused — or declined at the encryption prompt — leaves what
      // was typed where the user left it.
      if ((await sendDm(convId, text, attachments, { confirmUnencrypted })) === "cancelled") return;
    } catch (e) {
      showHubError(e instanceof HubApiError ? e.message : String(e));
      return;
    }
    setInputText("");
    setPendingAttachments([]);
    // The hub never echoes a DM back to its sender (anti-echo), so reload
    // the log to show the sent message — same source-of-truth reload the
    // onDm arm does for inbound messages. Send already succeeded: a reload
    // failure here must not put the text back (that invites a double-send).
    try {
      const msgs = await getDmMessages(convId);
      setDmMessages((prev) => ({ ...prev, [convId]: toDmMessages(msgs) }));
    } catch {}
  }

  // WS arms — plugged into App's handler registry.
  function onDm(raw: unknown) {
    const m = raw as Record<string, unknown>;
    const convId = m.conversation_id as string | undefined;
    if (!convId) return;
    setUnreadDms((prev) => ({ ...prev, [convId]: true }));
    // WS gives plaintext (or "[encrypted]" placeholder for encrypted).
    // Reload conversation messages so the browser client can auto-decrypt.
    if (convId === selectedConvRef.current?.id) {
      getDmMessages(convId).then((msgs) => {
        setDmMessages((prev) => ({ ...prev, [convId]: toDmMessages(msgs) }));
      }).catch(() => {});
    }
  }

  function onDmMemberChanged(raw: unknown) {
    const m = raw as { conversation_id?: string; added?: string[]; removed?: string[] };
    if (!m.conversation_id) return;
    const convId = m.conversation_id;
    getConversation(convId).then((updated) => {
      // Upsert: a brand-new conversation (someone just started a DM with us)
      // arrives via this event too — the hub announces creation since
      // 2026-07-26 — so prepend it when it's not in the list yet.
      setConversations((prev) => prev.some((c) => c.id === convId)
        ? prev.map((c) => c.id === convId ? updated : c)
        : [updated, ...prev]);
    }).catch(() => {
      // Fetch fails when we were the one removed — drop the conversation.
      setConversations((prev) => prev.filter((c) => c.id !== convId));
    });
  }

  return {
    conversations,
    setConversations,
    dmMessages,
    selectedConversation,
    setSelectedConversation,
    selectedConvRef,
    encryptionWarning,
    handleSelectConversation,
    handleStartConversation,
    peerNames,
    handleSendDm,
    attachFiles,
    onDm,
    onDmMemberChanged,
  };
}
