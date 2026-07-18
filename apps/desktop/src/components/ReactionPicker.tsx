import { CSSProperties, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadRecentEmojis, pushRecentEmoji } from "@wavvon/core";
import { EMOJI_CATALOG, FocusTrap } from "@wavvon/ui";

const POPUP_HEIGHT = 300; // estimated max height in px

export function ReactionPicker({
  onPick,
}: {
  onPick: (emoji: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({});
  const [query, setQuery] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
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

      // Position the popup using fixed coordinates so it is never clipped
      // by a scrollable ancestor (the messages container has overflow:auto).
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) {
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;
        const style: CSSProperties = {
          position: "fixed",
          right: window.innerWidth - rect.right,
          zIndex: 1000,
        };
        if (spaceAbove >= POPUP_HEIGHT || spaceAbove >= spaceBelow) {
          // Enough room above — open upward
          style.bottom = window.innerHeight - rect.top + 4;
        } else {
          // Not enough room above — open downward
          style.top = rect.bottom + 4;
        }
        setPopupStyle(style);
      }
    }
    setOpen((v) => !v);
  }

  return (
    <div className="reaction-picker">
      <button
        ref={btnRef}
        className="reaction-add-btn"
        onClick={handleOpen}
        title={t("reaction.add")}
      >
        🙂+
      </button>
      {open && (
        <>
          {/* Transparent overlay closes picker on outside click */}
          <div className="reaction-picker-overlay" onClick={handleClose} />
          <FocusTrap>
            <div
              className="reaction-picker-popup"
              style={popupStyle}
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
                placeholder={t("reaction.search_placeholder")}
              />
              {!query && recents.length > 0 && (
                <>
                  <div className="reaction-picker-section-label">{t("reaction.recent")}</div>
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
                  <span className="muted reaction-picker-empty">{t("reaction.no_matches")}</span>
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
        </>
      )}
    </div>
  );
}
