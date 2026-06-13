import { useState, useEffect, useRef } from "react";
import type { MemberAdminInfo, RoleInfo } from "../types";
import { formatPubkey, formatRelative } from "../utils/format";

export function MemberRow({
  member,
  allRoles,
  voiceMuted,
  onKick,
  onBan,
  onMute,
  onTimeout,
  onVoiceMute,
  onVoiceUnmute,
  onToggleRole,
}: {
  member: MemberAdminInfo;
  allRoles: RoleInfo[];
  voiceMuted: boolean;
  onKick: () => void;
  onBan: () => void;
  onMute: () => void;
  onTimeout: () => void;
  onVoiceMute: () => void;
  onVoiceUnmute: () => void;
  onToggleRole: (roleId: string, hasRole: boolean) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [showRoles, setShowRoles] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasRoleId = new Set(member.roles.map((r) => r.id));

  useEffect(() => {
    if (!menuOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        gearRef.current &&
        !gearRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
        setShowRoles(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [menuOpen]);

  function openMenu(x: number, y: number) {
    setMenuPos({ x, y });
    setMenuOpen(true);
    setShowRoles(false);
  }

  function handleGear(e: React.MouseEvent) {
    e.stopPropagation();
    if (menuOpen) {
      setMenuOpen(false);
    } else {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      openMenu(rect.left, rect.bottom + 4);
    }
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    openMenu(e.clientX, e.clientY);
  }

  function action(fn: () => void) {
    return () => {
      setMenuOpen(false);
      setShowRoles(false);
      fn();
    };
  }

  return (
    <tr
      className="member-row"
      onContextMenu={handleContextMenu}
    >
      <td>
        <div className="member-name">
          {member.display_name || formatPubkey(member.public_key)}
        </div>
        <div className="member-pk" title={member.public_key}>
          {formatPubkey(member.public_key)}
        </div>
      </td>
      <td>
        <div className="member-roles">
          {member.roles.map((r) => (
            <span key={r.id} className="member-role-chip">
              {r.name}
            </span>
          ))}
          {member.roles.length === 0 && <span className="muted">none</span>}
        </div>
      </td>
      <td>{formatRelative(member.first_seen_at)}</td>
      <td>
        <div className="member-actions">
          <button
            ref={gearRef}
            className="member-gear-btn"
            onClick={handleGear}
            title="Member actions"
          >
            ⚙
          </button>
          {menuOpen && (
            <>
              <div
                className="context-menu-overlay"
                onMouseDown={() => { setMenuOpen(false); setShowRoles(false); }}
              />
              <div
                ref={menuRef}
                className="context-menu"
                style={{ top: menuPos.y, left: menuPos.x }}
              >
                <button
                  className="context-menu-item"
                  onClick={() => setShowRoles((v) => !v)}
                >
                  Roles ▾
                </button>
                {showRoles && (
                  <div style={{ paddingLeft: 8 }}>
                    {allRoles
                      .filter((r) => r.id !== "builtin-owner")
                      .map((r) => {
                        const has = hasRoleId.has(r.id);
                        return (
                          <label key={r.id} className="checkbox-label context-menu-subitem">
                            <input
                              type="checkbox"
                              checked={has}
                              onChange={() => { onToggleRole(r.id, has); }}
                            />
                            {r.name}
                          </label>
                        );
                      })}
                  </div>
                )}
                <button className="context-menu-item" onClick={action(onTimeout)}>
                  Timeout
                </button>
                <button className="context-menu-item" onClick={action(onMute)}>
                  Mute
                </button>
                {voiceMuted ? (
                  <button className="context-menu-item" onClick={action(onVoiceUnmute)}>
                    Unmute voice
                  </button>
                ) : (
                  <button className="context-menu-item" onClick={action(onVoiceMute)}>
                    Mute voice
                  </button>
                )}
                <button className="context-menu-item" onClick={action(onKick)}>
                  Kick
                </button>
                <button className="context-menu-item danger" onClick={action(onBan)}>
                  Ban
                </button>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
