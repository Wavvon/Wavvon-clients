import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InstalledGame } from "../types";
import { FocusTrap } from "./FocusTrap";

interface LiveSessionEntry {
  id: string;
  player_count: number;
}

interface Props {
  games: InstalledGame[];
  channelId: string | null;
  onSelect: (game: InstalledGame, sessionId: string | null) => void;
  onClose: () => void;
}

export function GamePicker({ games, channelId, onSelect, onClose }: Props) {
  const [liveSessions, setLiveSessions] = useState<Record<string, LiveSessionEntry>>({});

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!channelId) return;
    invoke<Array<{ id: string; game_id: string; status: string; player_count: number }>>(
      "game_list_sessions",
      { channelId }
    ).then((sessions) => {
      const map: Record<string, LiveSessionEntry> = {};
      for (const s of sessions) {
        map[s.game_id] = { id: s.id, player_count: s.player_count };
      }
      setLiveSessions(map);
    }).catch(() => {});
  }, [channelId]);

  async function handleGameClick(game: InstalledGame) {
    const existing = liveSessions[game.id];
    if (existing) {
      try {
        await invoke("game_join_session", { sessionId: existing.id });
      } catch {
        // proceed even if join call fails — modal will try again
      }
      onSelect(game, existing.id);
    } else {
      try {
        const result = await invoke<{ session_id: string }>("game_create_session", {
          gameId: game.id,
          channelId,
        });
        onSelect(game, result.session_id);
      } catch {
        onSelect(game, null);
      }
    }
  }

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
            {games.map((g) => {
              const liveSession = liveSessions[g.id];
              return (
                <li
                  key={g.id}
                  className="game-picker-item"
                  onClick={() => handleGameClick(g)}
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
                    <span className="game-picker-name">
                      {g.name}
                      {liveSession && (
                        <span className="game-live-badge">● Live · {liveSession.player_count}p</span>
                      )}
                    </span>
                    {g.description && (
                      <span className="game-picker-desc muted">{g.description}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      </FocusTrap>
    </div>
  );
}
