import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { User, PublicHubProfile } from "../types";
import { formatPubkey } from "../utils/format";

interface Props {
  menu: { x: number; y: number; user: User };
  publicKey: string | null;
  blockedUsers: Set<string>;
  ignoredUsers: Set<string>;
  activeHubUrl: string;
  onClose: () => void;
  onDm: (user: User) => void;
  onAddFriend: (user: User) => void;
  onCopyKey: (user: User) => void;
  onToggleBlock: (pubkey: string) => void;
  onToggleIgnore: (pubkey: string) => void;
  onToast: (msg: string) => void;
  onJoinHub: (hubUrl: string, inviteCode: string) => void;
}

export function UserContextMenu({
  menu, publicKey, blockedUsers, ignoredUsers, activeHubUrl,
  onClose, onDm, onAddFriend, onCopyKey, onToggleBlock, onToggleIgnore, onToast, onJoinHub,
}: Props) {
  const { x, y, user } = menu;
  const [profile, setProfile] = useState<PublicHubProfile | null | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    setProfile("loading");
    invoke<PublicHubProfile | null>("fetch_public_profile", {
      hubUrl: activeHubUrl,
      pubkey: user.public_key,
    })
      .then((result) => { if (!cancelled) setProfile(result); })
      .catch(() => { if (!cancelled) setProfile(null); });
    return () => { cancelled = true; };
  }, [user.public_key, activeHubUrl]);

  return (
    <div
      className="context-menu-overlay"
      onClick={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
    >
      <div
        className="context-menu"
        style={{ top: y, left: x }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="context-menu-header">
          {user.display_name || formatPubkey(user.public_key)}
        </div>
        {user.public_key !== publicKey && (
          <>
            <button className="context-menu-item" onClick={() => onDm(user)}>
              Direct message
            </button>
            <button className="context-menu-item" onClick={() => onAddFriend(user)}>
              Add friend
            </button>
          </>
        )}
        <button className="context-menu-item" onClick={() => onCopyKey(user)}>
          Copy public key
        </button>
        {user.public_key !== publicKey && (
          <>
            <button
              className="context-menu-item"
              onClick={() => {
                const wasIgnored = ignoredUsers.has(user.public_key);
                onClose();
                onToggleIgnore(user.public_key);
                onToast(wasIgnored ? "No longer ignoring" : "Ignored. Their messages will be collapsed.");
              }}
            >
              {ignoredUsers.has(user.public_key) ? "Unignore user" : "Ignore user"}
            </button>
            <button
              className="context-menu-item"
              onClick={() => {
                const wasBlocked = blockedUsers.has(user.public_key);
                onClose();
                onToggleBlock(user.public_key);
                onToast(wasBlocked ? "Unblocked" : "Blocked. Their messages and mentions will be hidden.");
              }}
            >
              {blockedUsers.has(user.public_key) ? "Unblock user" : "Block user"}
            </button>
          </>
        )}
        {profile === "loading" && (
          <div className="muted" style={{ padding: "4px 12px", fontSize: "var(--text-sm)" }}>
            Loading profile…
          </div>
        )}
        {profile !== "loading" && profile !== null && profile.public_hubs.length > 0 && (
          <>
            <div className="their-hubs-header">Their hubs</div>
            {profile.public_hubs.map((hub) => (
              <button
                key={hub.hub_url}
                className="their-hub-item"
                onClick={() => {
                  onClose();
                  onJoinHub(hub.hub_url, "");
                }}
              >
                {hub.hub_name}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
