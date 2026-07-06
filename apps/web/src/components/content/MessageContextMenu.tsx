import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { hubFetch } from "@platform";

interface Props {
  position: { x: number; y: number };
  senderLabel: string;
  senderPubkey: string;
  isMine: boolean;
  canDelete: boolean;
  isAdmin: boolean;
  isPinned: boolean;
  onClose: () => void;
  onReply: () => void;
  onCopyText: () => void;
  onCopyLink: () => void;
  onPinToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
  onViewProfile: () => void;
  onToast: (msg: string) => void;
}

/** Right-click menu on a message row: actions for the message itself on
 * top, then actions for its author. Author moderation mirrors
 * UserContextMenu (the menu the author's name/avatar opens). */
export function MessageContextMenu({
  position, senderLabel, senderPubkey, isMine, canDelete, isAdmin, isPinned,
  onClose, onReply, onCopyText, onCopyLink, onPinToggle, onEdit, onDelete,
  onReport, onViewProfile, onToast,
}: Props) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Clamp to the viewport after render.
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) el.style.left = `${Math.max(0, position.x - rect.width)}px`;
    if (rect.bottom > window.innerHeight) el.style.top = `${Math.max(0, position.y - rect.height)}px`;
  }, [position]);

  function pick(action: () => void) {
    return () => { onClose(); action(); };
  }

  async function handleCopyKey() {
    onClose();
    try {
      await navigator.clipboard.writeText(senderPubkey);
      onToast("Public key copied");
    } catch {
      onToast("Copy failed");
    }
  }

  async function moderate(kind: "mute" | "kick" | "ban") {
    onClose();
    if (kind !== "mute" && !confirm(`${kind === "kick" ? "Kick" : "Ban"} ${senderLabel}?`)) return;
    const path = kind === "mute" ? "/moderation/mutes" : kind === "kick" ? "/moderation/kick" : "/moderation/bans";
    try {
      await hubFetch(path, {
        method: "POST",
        body: JSON.stringify({ target_public_key: senderPubkey }),
      });
      onToast(kind === "mute" ? "Muted" : kind === "kick" ? "Kicked" : "Banned");
    } catch (e) {
      onToast(`Failed to ${kind}: ${e}`);
    }
  }

  return (
    <div
      className="context-menu-overlay"
      onClick={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
    >
      <div
        ref={menuRef}
        className="context-menu"
        style={{ top: position.y, left: position.x, maxHeight: "80vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="context-menu-item" onClick={pick(onReply)}>
          {t("message.action.reply")}
        </button>
        <button className="context-menu-item" onClick={pick(onCopyText)}>
          {t("message.action.copy_text")}
        </button>
        <button className="context-menu-item" onClick={pick(onCopyLink)}>
          {t("message.action.copy_link")}
        </button>
        {isAdmin && (
          <button className="context-menu-item" onClick={pick(onPinToggle)}>
            {isPinned ? "Unpin message" : "Pin message"}
          </button>
        )}
        {isMine && (
          <button className="context-menu-item" onClick={pick(onEdit)}>
            {t("message.action.edit")}
          </button>
        )}
        {canDelete && (
          <button className="context-menu-item danger" onClick={pick(onDelete)}>
            {t("message.action.delete")}
          </button>
        )}
        {!isMine && (
          <button className="context-menu-item" onClick={pick(onReport)}>
            Report message
          </button>
        )}

        <div className="context-menu-header" style={{ borderTop: "1px solid var(--border)", marginTop: 4 }}>
          {senderLabel}
        </div>
        <button className="context-menu-item" onClick={pick(onViewProfile)}>
          View profile
        </button>
        <button className="context-menu-item" onClick={handleCopyKey}>
          Copy public key
        </button>
        {isAdmin && !isMine && (
          <>
            <button className="context-menu-item" onClick={() => void moderate("mute")}>
              Mute
            </button>
            <button className="context-menu-item danger" onClick={() => void moderate("kick")}>
              Kick
            </button>
            <button className="context-menu-item danger" onClick={() => void moderate("ban")}>
              Ban
            </button>
          </>
        )}
      </div>
    </div>
  );
}
