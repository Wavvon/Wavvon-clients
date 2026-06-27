import React, { useCallback, useRef, useState } from "react";
import type { User } from "../types";
import { formatPubkey } from "@wavvon/core";
import { Avatar } from "@wavvon/ui";

export function UserListGrouped({
  users,
  inVoice,
  onContextMenu,
  onBotClick,
}: {
  users: User[];
  inVoice?: Set<string>;
  onContextMenu?: (e: React.MouseEvent, user: User) => void;
  onBotClick?: (pubkey: string, e: React.MouseEvent) => void;
}) {
  const [filter, setFilter] = useState("");
  const [botsExpanded, setBotsExpanded] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  const q = filter.trim().toLowerCase();
  const matched = q
    ? users.filter((u) =>
        ((u.display_name ?? "") + " " + u.public_key).toLowerCase().includes(q),
      )
    : users;

  const bots = matched.filter((u) => u.is_bot && !u.is_webhook);
  const humans = matched.filter((u) => !u.is_bot);

  const online = humans.filter((u) => u.online);
  const offline = humans.filter((u) => !u.online);

  function bucket(group: User[], fallback: string): [string, User[]][] {
    const grouped = new Map<string, User[]>();
    const ungrouped: User[] = [];
    for (const u of group) {
      if (u.group_role) {
        if (!grouped.has(u.group_role)) grouped.set(u.group_role, []);
        grouped.get(u.group_role)!.push(u);
      } else {
        ungrouped.push(u);
      }
    }
    const out: [string, User[]][] = Array.from(grouped.entries());
    if (ungrouped.length > 0) out.push([fallback, ungrouped]);
    return out;
  }

  const onlineBuckets = bucket(online, "Online");
  const offlineBuckets = bucket(offline, "Offline");

  const allUsers = [...online, ...offline];

  const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(index + 1, allUsers.length - 1);
      setFocusedIndex(next);
      itemRefs.current[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(index - 1, 0);
      setFocusedIndex(prev);
      itemRefs.current[prev]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusedIndex(0);
      itemRefs.current[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      const last = allUsers.length - 1;
      setFocusedIndex(last);
      itemRefs.current[last]?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const u = allUsers[index];
      if (u && onContextMenu) {
        const el = itemRefs.current[index];
        if (el) {
          const rect = el.getBoundingClientRect();
          onContextMenu({ clientX: rect.right, clientY: rect.top } as React.MouseEvent, u);
        }
      }
    }
  }, [allUsers, onContextMenu]);

  const onlineCount = humans.filter((u) => u.online).length;
  let globalIdx = 0;

  return (
    <>
      <div className="user-list-header">
        <span className="user-list-total">
          {humans.length} {humans.length === 1 ? "member" : "members"}
        </span>
        <span className="user-list-online" title="Online">
          <span className="status-dot online" />
          {onlineCount}
        </span>
      </div>
      <div className="user-list-filter">
        <input
          type="text"
          placeholder="Filter members…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {filter && matched.length === 0 && (
          <p className="muted user-list-empty">No matches</p>
        )}
      </div>
      {onlineBuckets.map(([title, list]) => (
        <div className="user-section" key={`on-${title}`}>
          <p className="user-section-title">
            {title} — {list.length}
          </p>
          <ul className="user-list">
            {list.map((u) => {
              const idx = globalIdx++;
              return (
                <li
                  key={u.public_key}
                  ref={(el) => { itemRefs.current[idx] = el; }}
                  className="user-list-item"
                  tabIndex={focusedIndex === idx ? 0 : -1}
                  onKeyDown={(e) => handleKeyDown(e, idx)}
                  onContextMenu={(e) => onContextMenu?.(e, u)}
                >
                  <Avatar src={u.avatar} name={u.display_name || u.public_key} size={24} />
                  <span className="status-dot online" />
                  <span className="user-name">
                    {u.display_name || u.public_key.slice(0, 16)}
                  </span>
                  {inVoice?.has(u.public_key) && (
                    <span className="user-in-voice" title="In voice">
                      🎙️
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {offlineBuckets.map(([title, list]) => (
        <div className="user-section" key={`off-${title}`}>
          <p className="user-section-title">
            {title} — {list.length}
          </p>
          <ul className="user-list">
            {list.map((u) => {
              const idx = globalIdx++;
              return (
                <li
                  key={u.public_key}
                  ref={(el) => { itemRefs.current[idx] = el; }}
                  className="user-list-item offline"
                  tabIndex={focusedIndex === idx ? 0 : -1}
                  onKeyDown={(e) => handleKeyDown(e, idx)}
                  onContextMenu={(e) => onContextMenu?.(e, u)}
                >
                  <Avatar src={u.avatar} name={u.display_name || u.public_key} size={24} />
                  <span className="status-dot offline" />
                  <span className="user-name">
                    {u.display_name || u.public_key.slice(0, 16)}
                  </span>
                  {inVoice?.has(u.public_key) && (
                    <span className="user-in-voice" title="In voice">
                      🎙️
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {bots.length > 0 && (
        <div className="member-section member-section-bots">
          <button
            className="member-section-header"
            onClick={() => setBotsExpanded((prev) => !prev)}
          >
            {botsExpanded ? "▼" : "▶"} Bots — {bots.length}
          </button>
          {botsExpanded && bots.map((bot) => (
            <div
              key={bot.public_key}
              className="member-list-item"
              style={{ cursor: onBotClick ? "pointer" : undefined }}
              onClick={onBotClick ? (e) => onBotClick(bot.public_key, e) : undefined}
            >
              <Avatar src={bot.avatar} name={bot.display_name ?? bot.public_key} size={22} />
              <span className="member-name">{bot.display_name ?? formatPubkey(bot.public_key)}</span>
              <span className="bot-badge" style={{ fontSize: "10px", padding: "0 4px" }}>BOT</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
