import { useMemo, useRef, useState } from "react";
import { EMOJI_CATALOG } from "../constants";
import { loadRecentEmojis, pushRecentEmoji } from "../utils/recentEmoji";
import { FocusTrap } from "./FocusTrap";

export function ReactionPicker({
  onPick,
}: {
  onPick: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [openDown, setOpenDown] = useState(false);
  const [query, setQuery] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  // Re-read recents whenever we open so picks made elsewhere show up.
  const [recents, setRecents] = useState<string[]>(() => loadRecentEmojis());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return EMOJI_CATALOG;
    return EMOJI_CATALOG.filter(([_emoji, kw]) => kw.includes(q));
  }, [query]);

  function handleClose() {
    setOpen(false);
    setQuery("");
  }

  function handlePick(emoji: string) {
    pushRecentEmoji(emoji);
    setRecents(loadRecentEmojis());
    onPick(emoji);
    handleClose();
  }

  function handleOpen() {
    if (!open) {
      setRecents(loadRecentEmojis());
      // Detect whether there is enough room above the button.
      // The popup is ~280px tall; if the button is within 300px of the top
      // of the viewport, open downward instead.
      const rect = btnRef.current?.getBoundingClientRect();
      const spaceAbove = rect?.top ?? 999;
      setOpenDown(spaceAbove < 300);
    }
    setOpen((v) => !v);
  }

  return (
    <div className="reaction-picker">
      <button
        ref={btnRef}
        className="reaction-add-btn"
        onClick={handleOpen}
        title="Add reaction"
      >
        🙂+
      </button>
      {open && (
        <FocusTrap>
        <div
          className={`reaction-picker-popup ${openDown ? "open-down" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            className="reaction-picker-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") handleClose();
              else if (e.key === "Enter" && filtered.length > 0) {
                handlePick(filtered[0][0]);
              }
            }}
            placeholder="Search emoji…"
          />
          {!query && recents.length > 0 && (
            <>
              <div className="reaction-picker-section-label">Recent</div>
              <div className="reaction-picker-grid reaction-picker-recents">
                {recents.map((emoji) => (
                  <button
                    key={`r-${emoji}`}
                    className="reaction-picker-emoji"
                    onClick={() => handlePick(emoji)}
                    title={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div className="reaction-picker-divider" />
            </>
          )}
          <div className="reaction-picker-grid">
            {filtered.length === 0 ? (
              <span className="muted reaction-picker-empty">No matches</span>
            ) : (
              filtered.map(([emoji]) => (
                <button
                  key={emoji}
                  className="reaction-picker-emoji"
                  onClick={() => handlePick(emoji)}
                  title={emoji}
                >
                  {emoji}
                </button>
              ))
            )}
          </div>
        </div>
        </FocusTrap>
      )}
    </div>
  );
}
