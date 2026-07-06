import React, { useEffect, useState } from "react";
import type { Channel } from "../types";
import { FocusTrap } from "@wavvon/ui";

export function ChannelPalette({
  channels,
  onClose,
  onSelect,
}: {
  channels: Channel[];
  onClose: () => void;
  onSelect: (c: Channel) => void;
}) {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? channels.filter((c) => c.name.toLowerCase().includes(q))
    : channels.slice(0, 20);

  // Clamp the highlighted index when results shrink so Enter never picks
  // a stale row.
  useEffect(() => {
    if (highlighted >= filtered.length) setHighlighted(0);
  }, [filtered.length, highlighted]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = filtered[highlighted];
      if (c) onSelect(c);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="palette-input"
          placeholder="Jump to channel…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
        />
        <ul className="palette-list">
          {filtered.length === 0 ? (
            <li className="palette-empty">No channels match.</li>
          ) : (
            filtered.map((c, i) => (
              <li
                key={c.id}
                className={`palette-item ${i === highlighted ? "active" : ""}`}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => onSelect(c)}
              >
                <span className="palette-hash">#</span>
                <span className="palette-name">{c.name}</span>
              </li>
            ))
          )}
        </ul>
        <div className="palette-hint muted">
          ↑↓ navigate · Enter select · Esc close
        </div>
      </div>
      </FocusTrap>
    </div>
  );
}
