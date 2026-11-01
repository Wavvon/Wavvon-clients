import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { SavedSticker } from "@wavvon/core";
import type { Sticker, StickerPack } from "../../types";
import { needsExternal, stickerErrorKey, stickerSrc } from "../../utils/stickers";
import { FocusTrap } from "../FocusTrap";
import type { StickerActions } from "./stickerActions";

const POPUP_HEIGHT = 340;
const SAVED = "saved";

interface Props {
  channelId: string;
  actions: StickerActions;
  onError: (msg: string) => void;
}

export function StickerPicker({ channelId, actions, onError }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<string>(SAVED);
  const [packs, setPacks] = useState<StickerPack[] | null>(null);
  const [packsFailed, setPacksFailed] = useState(false);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({});
  const [sending, setSending] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const { collection } = actions;

  function close() {
    setOpen(false);
  }

  // Capture phase: the composer's own Escape handling must not swallow this.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  function loadPacks() {
    setPacksFailed(false);
    actions.listPacks().then(setPacks).catch(() => { setPacks([]); setPacksFailed(true); });
  }

  function toggle() {
    if (!open) {
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) {
        const style: CSSProperties = { position: "fixed", right: window.innerWidth - rect.right, zIndex: 1000 };
        if (rect.top >= POPUP_HEIGHT || rect.top >= window.innerHeight - rect.bottom) {
          style.bottom = window.innerHeight - rect.top + 4;
        } else {
          style.top = rect.bottom + 4;
        }
        setPopupStyle(style);
      }
      loadPacks();
    }
    setOpen((v) => !v);
  }

  async function send(run: () => Promise<void>) {
    if (sending) return;
    setSending(true);
    try {
      await run();
      close();
    } catch (e) {
      onError(t(stickerErrorKey(e, "send")));
    } finally {
      setSending(false);
    }
  }

  const activePack = packs?.find((p) => p.id === tab) ?? null;
  const showTab = activePack || tab === SAVED ? tab : SAVED;

  return (
    <div className="reaction-picker">
      <button
        ref={btnRef}
        type="button"
        className="composer-btn"
        onClick={toggle}
        title={t("stickers.picker.open")}
        aria-label={t("stickers.picker.open")}
        aria-expanded={open}
      >
        <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 3h12a1 1 0 0 1 1 1v8l-5 5H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M17 12h-4a1 1 0 0 0-1 1v4" />
        </svg>
      </button>
      {open && (
        <>
          <div className="reaction-picker-overlay" onClick={close} />
          <FocusTrap>
            <div
              className="reaction-picker-popup sticker-picker-popup"
              style={popupStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticker-picker-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={showTab === SAVED}
                  className={`btn-small ${showTab === SAVED ? "" : "btn-secondary"}`}
                  onClick={() => setTab(SAVED)}
                >
                  {t("stickers.picker.saved")}
                </button>
                {packs?.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={showTab === p.id}
                    className={`btn-small ${showTab === p.id ? "" : "btn-secondary"}`}
                    onClick={() => setTab(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>

              {showTab === SAVED ? (
                <SavedGrid
                  saved={collection.stickers}
                  editable={collection.editable}
                  status={collection.status}
                  canUseExternal={actions.canUseExternal}
                  hubUrl={actions.hubUrl}
                  sending={sending}
                  onPick={(entry) => void send(() => actions.sendSavedSticker(channelId, entry))}
                  onRemove={collection.editable ? (sha) => void collection.remove(sha).catch((e) => onError(t(stickerErrorKey(e, "manage")))) : undefined}
                />
              ) : (
                <PackGrid
                  stickers={activePack?.stickers ?? []}
                  hubUrl={actions.hubUrl}
                  sending={sending}
                  onPick={(s) => void send(() => actions.sendPackSticker(channelId, s.id))}
                />
              )}
              {packsFailed && (
                <p className="muted sticker-picker-note">
                  {t("stickers.picker.packs_failed")}{" "}
                  <button type="button" className="btn-small btn-secondary" onClick={loadPacks}>{t("modal.retry")}</button>
                </p>
              )}
            </div>
          </FocusTrap>
        </>
      )}
    </div>
  );
}

function SavedGrid({ saved, editable, status, canUseExternal, hubUrl, sending, onPick, onRemove }: {
  saved: SavedSticker[];
  editable: boolean;
  status: "loading" | "ready" | "error";
  canUseExternal: boolean;
  hubUrl: string;
  sending: boolean;
  onPick: (s: SavedSticker) => void;
  onRemove?: (sha256: string) => void;
}) {
  const { t } = useTranslation();
  if (status === "loading") return <p className="muted sticker-picker-note">{t("stickers.picker.loading")}</p>;
  if (status === "error") return <p className="muted sticker-picker-note">{t("stickers.picker.collection_failed")}</p>;
  if (saved.length === 0) {
    return <p className="muted sticker-picker-note">{t(editable ? "stickers.picker.saved_empty" : "stickers.picker.saved_unavailable")}</p>;
  }
  return (
    <div className="reaction-picker-grid sticker-grid">
      {saved.map((s) => {
        const blocked = !canUseExternal && needsExternal(s, hubUrl);
        return (
          <span key={s.sha256} className="sticker-cell">
            <button
              type="button"
              className="reaction-picker-emoji sticker-cell-btn"
              disabled={blocked || sending}
              title={blocked ? t("stickers.picker.external_off", { name: s.name }) : t("stickers.picker.from", { name: s.name, hub: s.origin_hub_name })}
              onClick={() => onPick(s)}
            >
              <img
                src={stickerSrc(s.origin_hub_url, s.sha256)}
                alt={s.name}
                className={blocked ? "sticker-cell-img sticker-cell-img-off" : "sticker-cell-img"}
                loading="lazy"
              />
            </button>
            {onRemove && (
              <button
                type="button"
                className="sticker-cell-remove"
                aria-label={t("stickers.picker.remove", { name: s.name })}
                title={t("stickers.picker.remove", { name: s.name })}
                onClick={() => onRemove(s.sha256)}
              >
                ×
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

function PackGrid({ stickers, hubUrl, sending, onPick }: {
  stickers: Sticker[];
  hubUrl: string;
  sending: boolean;
  onPick: (s: Sticker) => void;
}) {
  const { t } = useTranslation();
  if (stickers.length === 0) return <p className="muted sticker-picker-note">{t("stickers.picker.pack_empty")}</p>;
  return (
    <div className="reaction-picker-grid sticker-grid">
      {stickers.map((s) => (
        <span key={s.id} className="sticker-cell">
          <button type="button" className="reaction-picker-emoji sticker-cell-btn" disabled={sending} title={s.name} onClick={() => onPick(s)}>
            <img src={stickerSrc(hubUrl, s.sha256)} alt={s.name} className="sticker-cell-img" loading="lazy" />
          </button>
        </span>
      ))}
    </div>
  );
}
