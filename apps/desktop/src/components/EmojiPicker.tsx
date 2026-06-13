import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { EMOJI_CATALOG } from "../constants";
import { loadRecentEmojis, pushRecentEmoji } from "@voxply/core";
import { FocusTrap } from "@voxply/ui";

const POPUP_HEIGHT = 320;

interface HubEmoji {
  id: string;
  name: string;
  url: string;
}

interface Props {
  /** Called when the user picks an emoji — either a Unicode char or `:name:` shortcode. */
  onPick: (text: string) => void;
  /** The active hub URL, used to build absolute image paths for hub emojis. */
  hubUrl?: string;
}

export function EmojiPicker({ onPick, hubUrl }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({});
  const [query, setQuery] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const [recents, setRecents] = useState<string[]>(() => loadRecentEmojis());
  const [hubEmojis, setHubEmojis] = useState<HubEmoji[]>([]);

  // Fetch hub emojis when the picker opens.
  useEffect(() => {
    if (!open) return;
    invoke<HubEmoji[]>("list_hub_emojis")
      .then(setHubEmojis)
      .catch(() => setHubEmojis([]));
  }, [open]);

  const filteredStandard = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return EMOJI_CATALOG;
    return EMOJI_CATALOG.filter(([_emoji, kw]) => kw.includes(q));
  }, [query]);

  const filteredHub = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return hubEmojis;
    return hubEmojis.filter((e) => e.name.toLowerCase().includes(q));
  }, [query, hubEmojis]);

  function handleClose() {
    setOpen(false);
    setQuery("");
  }

  function handlePickUnicode(emoji: string) {
    pushRecentEmoji(emoji);
    setRecents(loadRecentEmojis());
    onPick(emoji);
    handleClose();
  }

  function handlePickHub(emoji: HubEmoji) {
    onPick(`:${emoji.name}:`);
    handleClose();
  }

  function handleOpen() {
    if (!open) {
      setRecents(loadRecentEmojis());
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
          style.bottom = window.innerHeight - rect.top + 4;
        } else {
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
        🙂
      </button>
      {open && (
        <>
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
                  else if (e.key === "Enter") {
                    if (filteredHub.length > 0) handlePickHub(filteredHub[0]);
                    else if (filteredStandard.length > 0) handlePickUnicode(filteredStandard[0][0]);
                  }
                }}
                placeholder={t("reaction.search_placeholder")}
              />

              {/* Hub "This server" section */}
              {filteredHub.length > 0 && (
                <div className="emoji-picker-server-section">
                  <div className="emoji-picker-section-label">This server</div>
                  <div className="reaction-picker-grid">
                    {filteredHub.map((e) => (
                      <button
                        key={e.id}
                        className="reaction-picker-emoji"
                        onClick={() => handlePickHub(e)}
                        title={`:${e.name}:`}
                      >
                        <img
                          src={hubUrl ? `${hubUrl}${e.url}` : e.url}
                          alt={e.name}
                          className="inline-emoji"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent standard emojis */}
              {!query && recents.length > 0 && (
                <>
                  <div className="emoji-picker-section-label">{t("reaction.recent")}</div>
                  <div className="reaction-picker-grid reaction-picker-recents">
                    {recents.map((emoji) => (
                      <button
                        key={`r-${emoji}`}
                        className="reaction-picker-emoji"
                        onClick={() => handlePickUnicode(emoji)}
                        title={emoji}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <div className="reaction-picker-divider" />
                </>
              )}

              {/* Standard emoji catalog */}
              <div className="emoji-picker-section-label">Standard</div>
              <div className="reaction-picker-grid">
                {filteredStandard.length === 0 ? (
                  <span className="muted reaction-picker-empty">{t("reaction.no_matches")}</span>
                ) : (
                  filteredStandard.map(([emoji]) => (
                    <button
                      key={emoji}
                      className="reaction-picker-emoji"
                      onClick={() => handlePickUnicode(emoji)}
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
