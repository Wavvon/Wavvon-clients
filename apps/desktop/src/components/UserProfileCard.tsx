import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { UserProfile, RoleInfo } from "../types";
import { formatPubkey, formatRelative } from "@wavvon/core";
import { Avatar } from "@wavvon/ui";

interface Props {
  pubkey: string;
  hubUrl: string;
  anchorRect: DOMRect;
  myPubkey: string | null;
  isAdmin: boolean;
  myRoles: RoleInfo[];
  onClose: () => void;
  onKick?: (pubkey: string) => void;
  onBan?: (pubkey: string) => void;
  onMute?: (pubkey: string) => void;
}

export function UserProfileCard({
  pubkey,
  hubUrl,
  anchorRect,
  myPubkey,
  isAdmin,
  myRoles,
  onClose,
  onKick,
  onBan,
  onMute,
}: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);

  const canManage =
    isAdmin ||
    myRoles.some((r) =>
      r.permissions.some((p) => p === "admin" || p === "kick_members" || p === "ban_members")
    );

  useEffect(() => {
    let cancelled = false;
    invoke<UserProfile>("get_user_profile", { hubUrl, pubkey })
      .then((p) => { if (!cancelled) setProfile(p); })
      .catch(() => { if (!cancelled) setProfile(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pubkey, hubUrl]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [onClose]);

  const style: React.CSSProperties = {
    position: "fixed",
    zIndex: 400,
    top: Math.min(anchorRect.bottom + 4, window.innerHeight - 320),
    left: Math.min(anchorRect.left, window.innerWidth - 280),
  };

  const displayName = profile?.display_name || formatPubkey(pubkey);

  return (
    <div ref={cardRef} className="user-profile-card" style={style} role="dialog" aria-label={`Profile: ${displayName}`}>
      <div className="user-profile-card-header">
        <Avatar src={profile?.avatar ?? null} name={displayName} size={48} />
        <div className="user-profile-card-names">
          <span className="user-profile-card-name">{displayName}</span>
          <span className="user-profile-card-pubkey muted">{formatPubkey(pubkey)}</span>
        </div>
        <button className="user-profile-card-close btn-icon-header" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {loading && (
        <div className="user-profile-card-loading muted">Loading…</div>
      )}

      {!loading && profile && (
        <>
          {profile.joined_at > 0 && (
            <div className="user-profile-card-field">
              <span className="muted">Joined</span>{" "}
              <span>{formatRelative(profile.joined_at)}</span>
            </div>
          )}

          {profile.roles.length > 0 && (
            <div className="user-profile-card-roles">
              {profile.roles.map((r) => (
                <span key={r.id} className="role-chip">
                  {r.name}
                </span>
              ))}
            </div>
          )}

          {profile.badges.length > 0 && (
            <div className="user-profile-card-badges">
              {profile.badges.map((b, i) => (
                <span
                  key={i}
                  className="badge-chip"
                  style={b.color ? { borderColor: b.color, color: b.color } : undefined}
                >
                  {b.label}
                </span>
              ))}
            </div>
          )}

          {canManage && pubkey !== myPubkey && (
            <div className="user-profile-card-admin">
              {onKick && (
                <button
                  className="btn-secondary"
                  onClick={() => { onKick(pubkey); onClose(); }}
                >
                  Kick
                </button>
              )}
              {onBan && (
                <button
                  className="btn-secondary danger"
                  onClick={() => { onBan(pubkey); onClose(); }}
                >
                  Ban
                </button>
              )}
              {onMute && (
                <button
                  className="btn-secondary"
                  onClick={() => { onMute(pubkey); onClose(); }}
                >
                  Mute
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
