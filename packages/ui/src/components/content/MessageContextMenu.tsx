import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

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
  onReport?: () => void;
  onViewProfile: () => void;
  onToast: (msg: string) => void;
  onMute: (pubkey: string) => Promise<void>;
  onKick: (pubkey: string) => Promise<void>;
  onBan: (pubkey: string) => Promise<void>;
}

/** Right-click menu on a message row: actions for the message itself on
 * top, then actions for its author. Author moderation mirrors
 * UserContextMenu (the menu the author's name/avatar opens). */
export function MessageContextMenu({
  position, senderLabel, senderPubkey, isMine, canDelete, isAdmin, isPinned,
  onClose, onReply, onCopyText, onCopyLink, onPinToggle, onEdit, onDelete,
  onReport, onViewProfile, onToast, onMute, onKick, onBan,
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
    if (kind !== "mute" && !confirm(t(kind === "kick" ? "message.ctx.kick_confirm" : "message.ctx.ban_confirm", { name: senderLabel }))) return;
    try {
      if (kind === "mute") await onMute(senderPubkey);
      else if (kind === "kick") await onKick(senderPubkey);
      else await onBan(senderPubkey);
      onToast(kind === "mute" ? t("message.ctx.muted") : kind === "kick" ? t("message.ctx.kicked") : t("message.ctx.banned"));
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
            {isPinned ? t("message.action.unpin") : t("message.action.pin")}
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
        {!isMine && onReport && (
          <button className="context-menu-item" onClick={pick(onReport)}>
            {t("message.ctx.report")}
          </button>
        )}

        <div className="context-menu-header" style={{ borderTop: "1px solid var(--border)", marginTop: 4 }}>
          {senderLabel}
        </div>
        <button className="context-menu-item" onClick={pick(onViewProfile)}>
          {t("message.ctx.view_profile")}
        </button>
        <button className="context-menu-item" onClick={handleCopyKey}>
          {t("message.ctx.copy_key")}
        </button>
        {isAdmin && !isMine && (
          <>
            <button className="context-menu-item" onClick={() => void moderate("mute")}>
              {t("message.ctx.mute")}
            </button>
            <button className="context-menu-item danger" onClick={() => void moderate("kick")}>
              {t("message.ctx.kick")}
            </button>
            <button className="context-menu-item danger" onClick={() => void moderate("ban")}>
              {t("message.ctx.ban")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
