import React from "react";
import type { User } from "../types";
import { formatPubkey } from "@wavvon/core";

interface Props {
  user: User;
  publicKey: string | null;
  blockedUsers: Set<string>;
  ignoredUsers: Set<string>;
  onClose: () => void;
  onDm: (user: User) => void;
  onAddFriend: (user: User) => void;
  onCopyKey: (user: User) => void;
  onToggleBlock: (pubkey: string) => void;
  onToggleIgnore: (pubkey: string) => void;
}

export function UserLongPressMenu({
  user, publicKey, blockedUsers, ignoredUsers,
  onClose, onDm, onAddFriend, onCopyKey, onToggleBlock, onToggleIgnore,
}: Props) {
  const isSelf = user.public_key === publicKey;
  const isBlocked = blockedUsers.has(user.public_key);
  const isIgnored = ignoredUsers.has(user.public_key);

  return (
    <div
      className="context-menu-overlay"
      onClick={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
    >
      <div
        className="context-menu context-menu-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{ bottom: 0, left: 0, right: 0, top: "auto", position: "fixed", borderRadius: "12px 12px 0 0" }}
      >
        <div className="context-menu-header">
          {user.display_name || formatPubkey(user.public_key)}
        </div>

        {!isSelf && (
          <>
            <button className="context-menu-item" style={{ minHeight: 48 }} onClick={() => { onClose(); onDm(user); }}>
              Direct message
            </button>
            <button className="context-menu-item" style={{ minHeight: 48 }} onClick={() => { onClose(); onAddFriend(user); }}>
              Add friend
            </button>
          </>
        )}
        <button className="context-menu-item" style={{ minHeight: 48 }} onClick={() => { onClose(); onCopyKey(user); }}>
          Copy public key
        </button>
        {!isSelf && (
          <>
            <button
              className="context-menu-item"
              style={{ minHeight: 48 }}
              onClick={() => { onClose(); onToggleIgnore(user.public_key); }}
            >
              {isIgnored ? "Un-ignore user" : "Ignore user"}
            </button>
            <button
              className="context-menu-item danger"
              style={{ minHeight: 48 }}
              onClick={() => { onClose(); onToggleBlock(user.public_key); }}
            >
              {isBlocked ? "Unblock user" : "Block user"}
            </button>
          </>
        )}
        <button className="context-menu-item" style={{ minHeight: 48 }} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
