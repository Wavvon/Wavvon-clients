import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { BotProfile } from "../types";
import { Avatar } from "./Avatar";
import { FocusTrap } from "./FocusTrap";

interface Props {
  pubkey: string;
  anchorRect: DOMRect;
  onClose: () => void;
  loadBotProfile: (pubkey: string) => Promise<BotProfile>;
  /** Null when the current view has no channel to launch into (e.g. a DM) --
   *  `bot_app_join` requires a channel id, so the Play button disables.
   *  Optional: platforms without a launch flow (desktop, pre-parity) omit
   *  both and get no Play button at all. */
  channelId?: string | null;
  onPlay?: (botId: string, channelId: string) => void;
}

export function BotCard({ pubkey, anchorRect, onClose, loadBotProfile, channelId, onPlay }: Props) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<BotProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadBotProfile(pubkey)
      .then(setProfile)
      .catch((e) => setError(String(e)));
  }, [pubkey, loadBotProfile]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onPointerDown(e: PointerEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose]);

  const style = computePosition(anchorRect);

  return (
    <FocusTrap>
      <div className="bot-card" ref={cardRef} style={style}>
        {error ? (
          <p className="muted">{error}</p>
        ) : !profile ? (
          <p className="muted">{t("bot.card.loading")}</p>
        ) : (
          <>
            <div className="bot-card-header">
              <Avatar src={profile.avatar_url} name={profile.name} pubkey={pubkey} size={40} />
              <div className="bot-card-identity">
                <span className="bot-card-name">{profile.name}</span>
                <span className="bot-badge">{t("bot.badge")}</span>
              </div>
            </div>
            {profile.description && (
              <p className="bot-card-desc">{profile.description}</p>
            )}
            {profile.game && onPlay && (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                {profile.game.thumbnail_url && (
                  <img
                    src={profile.game.thumbnail_url}
                    alt=""
                    style={{ width: 24, height: 24, objectFit: "cover", borderRadius: "var(--r-sm)" }}
                  />
                )}
                <button
                  className="btn-secondary btn-small"
                  disabled={!channelId}
                  title={channelId ? undefined : t("bot.card.play_no_channel")}
                  onClick={() => channelId && onPlay(pubkey, channelId)}
                >
                  {t("bot.card.play", { name: profile.game.name })}
                </button>
              </div>
            )}
            {profile.commands.length > 0 && (
              <div className="bot-card-commands">
                <p className="bot-card-section-label">{t("bot.card.commands")}</p>
                <ul>
                  {profile.commands.map((cmd) => (
                    <li key={cmd.name} className="bot-card-command-row">
                      <code className="bot-card-command-name">/{cmd.name}</code>
                      <span className="muted">{cmd.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="bot-card-footer muted">{t("bot.card.footer")}</p>
          </>
        )}
      </div>
    </FocusTrap>
  );
}

function computePosition(anchor: DOMRect): CSSProperties {
  const cardWidth = 280;
  const cardHeight = 320;
  const margin = 8;

  let left = anchor.right + margin;
  let top = anchor.top;

  if (left + cardWidth > window.innerWidth) {
    left = anchor.left - cardWidth - margin;
  }
  if (left < 0) left = margin;
  if (top + cardHeight > window.innerHeight) {
    top = window.innerHeight - cardHeight - margin;
  }
  if (top < 0) top = margin;

  return { position: "fixed", left, top, zIndex: 1000, width: cardWidth };
}
