import React, { useState } from "react";
import type { User } from "../types";
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

  // Filter on lowercased display_name OR pubkey prefix so users can find
  // someone they know by name even when their display_name is null.
  const q = filter.trim().toLowerCase();
  const matched = q
    ? users.filter((u) =>
        ((u.display_name ?? "") + " " + u.public_key).toLowerCase().includes(q),
      )
    : users;

  const bots = matched.filter((u) => u.is_bot && !u.is_webhook);
  const humans = matched.filter((u) => !u.is_bot);

  // Online first, then offline. Within each, bucket by group_role (the name of
  // the highest-priority role with display_separately=true), with null-role
  // members falling into a generic "Online" / "Offline" bucket.
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

  const onlineCount = humans.filter((u) => u.online).length;
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
            {list.map((u) => (
              <li
                key={u.public_key}
                className="user-list-item"
                onContextMenu={(e) => onContextMenu?.(e, u)}
              >
                <Avatar src={u.avatar} name={u.display_name || u.public_key} size={24} />
                <span
                  className={`status-dot ${u.status === "away" ? "away" : u.status === "dnd" ? "dnd" : "online"}`}
                  title={u.status === "away" ? "Away" : u.status === "dnd" ? "Do Not Disturb" : "Online"}
                />
                <span className="user-name" title={u.status_custom ?? undefined}>
                  {u.display_name || u.public_key.slice(0, 16)}
                  {u.status_custom && (
                    <span className="user-custom-status"> — {u.status_custom}</span>
                  )}
                </span>
                {inVoice?.has(u.public_key) && (
                  <span className="user-in-voice" title="In voice">
                    🎙️
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {offlineBuckets.map(([title, list]) => (
        <div className="user-section" key={`off-${title}`}>
          <p className="user-section-title">
            {title} — {list.length}
          </p>
          <ul className="user-list">
            {list.map((u) => (
              <li
                key={u.public_key}
                className="user-list-item offline"
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
            ))}
          </ul>
        </div>
      ))}
      {bots.length > 0 && (
        <div className="member-section member-section-bots">
          <button
            className="member-section-header"
            onClick={() => setBotsExpanded((prev) => !prev)}
          >
            BOTS — {bots.length}
          </button>
          {botsExpanded && bots.map((bot) => (
            <div
              key={bot.public_key}
              className="member-list-item"
              style={{ cursor: onBotClick ? "pointer" : undefined }}
              onClick={onBotClick ? (e) => onBotClick(bot.public_key, e) : undefined}
            >
              <Avatar src={bot.avatar} name={bot.display_name ?? bot.public_key} size={22} />
              <span className="member-name">{bot.display_name ?? "Bot"}</span>
              <span className="bot-badge">BOT</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
