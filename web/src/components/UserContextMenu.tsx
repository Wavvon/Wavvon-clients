import React, { useEffect, useRef } from "react";
import { hubFetch } from "@platform";

interface Props {
  pubkey: string;
  displayName: string | null;
  isAdmin: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onDm?: () => void;
  onToast?: (msg: string) => void;
}

export function UserContextMenu({ pubkey, displayName, isAdmin, position, onClose, onDm, onToast }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust position to keep menu inside viewport
  const style: React.CSSProperties = {
    position: "fixed",
    top: position.y,
    left: position.x,
    zIndex: 9999,
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Clamp menu to viewport after render
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      el.style.left = `${Math.max(0, position.x - rect.width)}px`;
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${Math.max(0, position.y - rect.height)}px`;
    }
  }, [position]);

  async function handleCopyKey() {
    try {
      await navigator.clipboard.writeText(pubkey);
      onToast?.("Public key copied");
    } catch {
      onToast?.("Copy failed");
    }
    onClose();
  }

  async function handleKick() {
    if (!confirm(`Kick ${displayName ?? pubkey.slice(0, 8)}?`)) return;
    try {
      await hubFetch(`/admin/members/${pubkey}`, { method: "DELETE" });
      onToast?.("Kicked");
    } catch (e) {
      onToast?.(`Failed to kick: ${e}`);
    }
    onClose();
  }

  async function handleBan() {
    if (!confirm(`Ban ${displayName ?? pubkey.slice(0, 8)}? They won't be able to rejoin.`)) return;
    try {
      await hubFetch("/admin/bans", {
        method: "POST",
        body: JSON.stringify({ target_public_key: pubkey }),
      });
      onToast?.("Banned");
    } catch (e) {
      onToast?.(`Failed to ban: ${e}`);
    }
    onClose();
  }

  async function handleMute() {
    try {
      await hubFetch(`/admin/members/${pubkey}/mute`, { method: "POST", body: "{}" });
      onToast?.("Muted");
    } catch (e) {
      onToast?.(`Failed to mute: ${e}`);
    }
    onClose();
  }

  return (
    <div
      className="context-menu-overlay"
      onClick={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9998 }}
    >
      <div
        ref={menuRef}
        className="context-menu"
        style={{
          ...style,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          boxShadow: "var(--shadow-lg, 0 4px 16px rgba(0,0,0,.4))",
          minWidth: 160,
          padding: "4px 0",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="context-menu-header"
          style={{
            padding: "8px 14px",
            fontWeight: 600,
            fontSize: "var(--text-sm)",
            borderBottom: "1px solid var(--border)",
            marginBottom: 4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayName ?? pubkey.slice(0, 8) + "…"}
        </div>

        {onDm && (
          <button
            className="context-menu-item"
            onClick={() => { onDm(); onClose(); }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "var(--text-sm)" }}
          >
            Send DM
          </button>
        )}

        <button
          className="context-menu-item"
          onClick={handleCopyKey}
          style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "var(--text-sm)" }}
        >
          Copy public key
        </button>

        {isAdmin && (
          <>
            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
            <button
              className="context-menu-item"
              onClick={handleMute}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "var(--text-sm)" }}
            >
              Mute
            </button>
            <button
              className="context-menu-item"
              onClick={handleKick}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "var(--text-sm)", color: "var(--danger)" }}
            >
              Kick
            </button>
            <button
              className="context-menu-item"
              onClick={handleBan}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "var(--text-sm)", color: "var(--danger)" }}
            >
              Ban
            </button>
          </>
        )}
      </div>
    </div>
  );
}
