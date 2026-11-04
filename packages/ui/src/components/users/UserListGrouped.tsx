import React, { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { User } from "../../types";
import { isBirthdayToday } from "@wavvon/core";
import { Avatar } from "../Avatar";
import { nameColorStyle, safeRoleColor } from "../../utils/roleAppearance";
import { CakeIcon, MicOnIcon } from "../Icons";
import type { MemberActivity } from "../../utils/memberActivity";

interface Section {
  key: string;
  title: string;
  users: User[];
  offline: boolean;
}

/**
 * One section per hoisted role, in role order, then "Members", then
 * "Offline". Hoisting only groups members who are online: an offline
 * moderator is offline first.
 */
export function groupMembers(users: User[], membersTitle: string, offlineTitle: string): Section[] {
  const online = users.filter((u) => u.online);
  const roles = new Map<string, { priority: number; users: User[] }>();
  const plain: User[] = [];
  for (const u of online) {
    if (!u.group_role) { plain.push(u); continue; }
    const r = roles.get(u.group_role) ?? { priority: u.group_role_priority ?? -Infinity, users: [] };
    r.users.push(u);
    roles.set(u.group_role, r);
  }
  const ordered = [...roles.entries()].sort(([an, a], [bn, b]) => b.priority - a.priority || an.localeCompare(bn));
  const sections: Section[] = ordered.map(([name, r]) => ({ key: `role-${name}`, title: name, users: r.users, offline: false }));
  if (plain.length > 0) sections.push({ key: "members", title: membersTitle, users: plain, offline: false });
  const offline = users.filter((u) => !u.online);
  if (offline.length > 0) sections.push({ key: "offline", title: offlineTitle, users: offline, offline: true });
  return sections;
}

export function UserListGrouped({
  users,
  speaking,
  activity,
  myPubkey,
  selfInvisible,
  hideBirthdays,
  onUserClick,
  onContextMenu,
}: {
  users: User[];
  /** Members currently *speaking*, not merely connected to voice — the hub
   *  reports on/off edges and this is the set they build. */
  speaking?: Set<string>;
  /** What a member is doing, for the status line: in a voice room, live. */
  activity?: Map<string, MemberActivity>;
  /** This device's own account, so it can be styled distinctly below. */
  myPubkey?: string | null;
  /** True while self chose the Invisible status — self still shows "offline"
   * here (same as everyone else sees them) but with a hollow-ring dot rather
   * than plain offline gray, so it doesn't look like a connection problem. */
  selfInvisible?: boolean;
  /** Viewer opt-out from the 🎂 badge (the third of three independent
   *  opt-ins — see decisions.md). */
  hideBirthdays?: boolean;
  onUserClick?: (pubkey: string) => void;
  onContextMenu?: (e: React.MouseEvent, user: User) => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  // Filter on lowercased display_name OR pubkey prefix so users can find
  // someone they know by name even when their display_name is null.
  const q = filter.trim().toLowerCase();
  const matched = q
    ? users.filter((u) => ((u.display_name ?? "") + " " + u.public_key).toLowerCase().includes(q))
    : users;

  const sections = groupMembers(matched, t("member.list.members"), t("member.list.offline"));
  const allUsers = sections.flatMap((s) => s.users);
  const onlineCount = matched.filter((u) => u.online).length;

  // Enter/Space opens the same context menu a right-click would, anchored at
  // the focused item, so keyboard-only users reach roles and mod actions.
  const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    const move = (i: number) => { e.preventDefault(); setFocusedIndex(i); itemRefs.current[i]?.focus(); };
    if (e.key === "ArrowDown") move(Math.min(index + 1, allUsers.length - 1));
    else if (e.key === "ArrowUp") move(Math.max(index - 1, 0));
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(allUsers.length - 1);
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const u = allUsers[index];
      const el = itemRefs.current[index];
      if (u && el && onContextMenu) {
        const rect = el.getBoundingClientRect();
        onContextMenu({ clientX: rect.right, clientY: rect.top } as React.MouseEvent, u);
      }
    }
  }, [allUsers, onContextMenu]);

  function statusLine(u: User, selfInvisibleRow: boolean): string | null {
    if (selfInvisibleRow) return t("presence.invisible");
    if (!u.online) return null;
    const a = activity?.get(u.public_key);
    if (a?.kind === "live") return t("member.status.live", { channel: a.channel });
    if (a?.kind === "voice") return t("member.status.in_voice", { channel: a.channel });
    if (u.status_custom) return u.status_custom;
    return u.status === "away" ? t("presence.away") : u.status === "dnd" ? t("presence.dnd") : t("presence.online");
  }

  function dotClass(u: User, selfInvisibleRow: boolean): string {
    if (selfInvisibleRow) return "invisible";
    if (!u.online) return "offline";
    return u.status === "away" ? "away" : u.status === "dnd" ? "dnd" : "online";
  }

  let globalIdx = 0;

  return (
    <>
      <div className="user-list-header">
        <span className="user-list-total">{t("member.list.count", { count: matched.length })}</span>
        <span className="user-list-online" title={t("presence.online")}>
          <span className="status-dot online" />
          {onlineCount}
        </span>
      </div>
      <div className="user-list-filter">
        <input
          type="text"
          placeholder={t("users.list.filter_placeholder")}
          aria-label={t("users.list.filter_placeholder")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {filter && matched.length === 0 && (
          <p className="muted user-list-empty">{t("users.list.no_matches")}</p>
        )}
      </div>
      {sections.map((section) => (
        <div className="user-section" key={section.key}>
          <p className="user-section-title">
            {section.title} — {section.users.length}
          </p>
          <ul className="user-list">
            {section.users.map((u) => {
              const idx = globalIdx++;
              const selfInvisibleRow = section.offline && !!selfInvisible && u.public_key === myPubkey;
              const line = statusLine(u, selfInvisibleRow);
              return (
                <li
                  key={u.public_key}
                  ref={(el) => { itemRefs.current[idx] = el; }}
                  className={`user-list-item${section.offline ? " offline" : ""}`}
                  style={onUserClick ? { cursor: "pointer" } : undefined}
                  tabIndex={focusedIndex === idx ? 0 : -1}
                  onClick={() => onUserClick?.(u.public_key)}
                  onKeyDown={(e) => handleKeyDown(e, idx)}
                  onContextMenu={(e) => onContextMenu?.(e, u)}
                >
                  <span className="user-avatar-presence">
                    <Avatar src={u.avatar} name={u.display_name || u.public_key} pubkey={u.public_key} size={28} />
                    <span
                      className={`status-dot ${dotClass(u, selfInvisibleRow)}`}
                      title={selfInvisibleRow ? t("presence.invisible_self_tooltip") : undefined}
                    />
                  </span>
                  <span className="user-text">
                    <span
                      className={`user-name${safeRoleColor(u.name_color) ? " name-colored" : ""}`}
                      style={nameColorStyle(u.name_color)}
                    >
                      {u.display_name || u.public_key.slice(0, 16)}
                      {!hideBirthdays && isBirthdayToday(u.birthday) && (
                        <span className="birthday-badge" title={t("message.birthday")} aria-label={t("message.birthday")}><CakeIcon size={12} /></span>
                      )}
                    </span>
                    {line && <span className="user-status-line">{line}</span>}
                  </span>
                  {speaking?.has(u.public_key) && (
                    <span className="user-speaking" title={t("voice.speaking")} aria-label={t("voice.speaking")}>
                      <MicOnIcon size={12} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}
