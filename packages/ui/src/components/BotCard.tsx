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
}

export function BotCard({ pubkey, anchorRect, onClose, loadBotProfile }: Props) {
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
