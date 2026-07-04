import { CSSProperties, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listSoundboardClips } from "@platform";
import type { SoundboardClip } from "../types";
import { FocusTrap } from "@wavvon/ui";

const POPUP_HEIGHT = 260;

interface Props {
  onTrigger: (clip: SoundboardClip) => void;
  playingClipId: string | null;
}

export function SoundboardPopover({ onTrigger, playingClipId }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({});
  const [clips, setClips] = useState<SoundboardClip[]>([]);
  const [loading, setLoading] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listSoundboardClips()
      .then(setClips)
      .catch(() => setClips([]))
      .finally(() => setLoading(false));
  }, [open]);

  function handleClose() {
    setOpen(false);
  }

  function handlePick(clip: SoundboardClip) {
    onTrigger(clip);
  }

  function handleOpen() {
    if (!open) {
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
        className="btn-icon-gear"
        onClick={handleOpen}
        title={t("voice.soundboard")}
        aria-label={t("voice.soundboard")}
      >
        🔊
      </button>
      {open && (
        <>
          <div className="reaction-picker-overlay" onClick={handleClose} />
          <FocusTrap>
            <div className="reaction-picker-popup" style={popupStyle} onClick={(e) => e.stopPropagation()}>
              <div className="emoji-picker-section-label">{t("voice.soundboard")}</div>
              {loading && <p className="muted">{t("modal.loading")}</p>}
              {!loading && clips.length === 0 && (
                <p className="muted">{t("voice.soundboard.empty")}</p>
              )}
              {!loading && clips.length > 0 && (
                <div className="reaction-picker-grid soundboard-clip-grid">
                  {clips.map((clip) => (
                    <button
                      key={clip.id}
                      className="soundboard-clip-btn"
                      disabled={playingClipId !== null}
                      onClick={() => handlePick(clip)}
                      title={clip.name}
                    >
                      <span className="soundboard-clip-emoji">{clip.emoji ?? "🔊"}</span>
                      <span className="soundboard-clip-name">{clip.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </FocusTrap>
        </>
      )}
    </div>
  );
}
