import { useTranslation } from "react-i18next";
import { formatRelative } from "@wavvon/core";
import { FocusTrap } from "../FocusTrap";
import { BookmarkIcon, CloseIcon } from "../Icons";
import { useCloseOnEscape } from "../../hooks/useCloseOnEscape";
import { savedKey, type SavedMessage } from "../../utils/savedMessages";

interface Props {
  items: SavedMessage[];
  onJump: (entry: SavedMessage) => void;
  onRemove: (key: string) => void;
  onClose: () => void;
}

/** The personal Saved list, across hubs, newest first. */
export function SavedMessagesModal({ items, onJump, onRemove, onClose }: Props) {
  const { t } = useTranslation();
  useCloseOnEscape(onClose);

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={t("saved.title")}>
      <FocusTrap>
        <div
          className="modal"
          style={{ maxWidth: 560, maxHeight: "70vh", display: "flex", flexDirection: "column" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <BookmarkIcon size={16} /> {t("saved.title")}
            </h2>
            <button className="btn-ghost" onClick={onClose} aria-label={t("modal.close")}><CloseIcon size={13} /></button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {items.length === 0 && (
              <p className="muted" style={{ textAlign: "center", padding: 16 }}>{t("saved.empty")}</p>
            )}
            {items.map((s) => (
              <div key={savedKey(s)} className="pinned-message-row">
                <div className="pinned-message-meta muted">
                  {[s.hub_name, s.channel_name ? `#${s.channel_name}` : null].filter(Boolean).join(" · ")}
                  {" · "}{t("saved.saved_at", { when: formatRelative(Math.floor(s.saved_at / 1000)) })}
                </div>
                {s.deleted ? (
                  <div className="pinned-message-content muted"><em>{t("saved.deleted")}</em></div>
                ) : (
                  <div
                    className="pinned-message-content"
                    role="button"
                    tabIndex={0}
                    title={t("message.pinned.jump")}
                    onClick={() => { onClose(); onJump(s); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { onClose(); onJump(s); } }}
                  >
                    {s.author && <><span className="message-sender">{s.author}</span>{": "}</>}
                    <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{s.excerpt}</span>
                    {s.message_at !== undefined && (
                      <span className="muted" style={{ fontSize: "var(--text-xs)", marginLeft: 8 }}>
                        {formatRelative(s.message_at)}
                      </span>
                    )}
                  </div>
                )}
                <button className="btn-small btn-secondary-small" onClick={() => onRemove(savedKey(s))}>
                  {t("saved.remove")}
                </button>
              </div>
            ))}
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
