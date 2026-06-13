import { useEffect } from "react";
import type { InstalledGame } from "../types";
import { FocusTrap } from "./FocusTrap";

interface Props {
  games: InstalledGame[];
  onSelect: (game: InstalledGame) => void;
  onClose: () => void;
}

export function GamePicker({ games, onSelect, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
      <div className="modal game-picker-modal" role="dialog" aria-modal="true" aria-labelledby="game-picker-title" onClick={(e) => e.stopPropagation()}>
        <div className="game-picker-header">
          <h3 id="game-picker-title">Activities</h3>
          <button className="game-picker-close" onClick={onClose} title="Close" aria-label="Close">×</button>
        </div>
        {games.length === 0 ? (
          <p className="muted game-picker-empty">
            No games installed on this hub. Ask an admin to install one.
          </p>
        ) : (
          <ul className="game-picker-list">
            {games.map((g) => (
              <li
                key={g.id}
                className="game-picker-item"
                onClick={() => onSelect(g)}
              >
                {g.thumbnail_url ? (
                  <img
                    className="game-picker-thumb"
                    src={g.thumbnail_url}
                    alt=""
                    aria-hidden="true"
                  />
                ) : (
                  <div className="game-picker-thumb game-picker-thumb-fallback" aria-hidden="true">
                    🎮
                  </div>
                )}
                <div className="game-picker-info">
                  <span className="game-picker-name">{g.name}</span>
                  {g.description && (
                    <span className="game-picker-desc muted">{g.description}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      </FocusTrap>
    </div>
  );
}
