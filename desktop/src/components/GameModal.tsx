import { useEffect, useRef } from "react";
import type { InstalledGame } from "../types";
import { FocusTrap } from "./FocusTrap";

interface Props {
  game: InstalledGame;
  theme: string;
  publicKey: string | null;
  displayName: string | null;
  avatar: string | null;
  onClose: () => void;
}

export function GameModal({ game, theme, publicKey, displayName, avatar, onClose }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const src = (() => {
    const url = new URL(game.entry_url);
    url.searchParams.set("theme", theme);
    return url.toString();
  })();

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type !== "voxply:getUser") return;
      const frame = iframeRef.current;
      if (!frame?.contentWindow) return;
      frame.contentWindow.postMessage(
        {
          type: "voxply:user",
          data: {
            public_key: publicKey,
            display_name: displayName,
            avatar,
          },
        },
        "*",
      );
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [publicKey, displayName, avatar]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="game-modal-overlay">
      <FocusTrap>
      <div className="game-modal">
        <div className="game-modal-titlebar">
          <span className="game-modal-title">{game.name}</span>
          <button className="game-modal-close" onClick={onClose} title="Close">×</button>
        </div>
        <iframe
          ref={iframeRef}
          className="game-modal-frame"
          src={src}
          title={game.name}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
      </FocusTrap>
    </div>
  );
}
