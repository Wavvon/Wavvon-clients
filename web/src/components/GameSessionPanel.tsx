import { useState, useEffect } from "react";
import type { GameSession, InstalledGame } from "../types";
import { formatRelative } from "@voxply/utils";
import {
  listGameSessions,
  createGameSession,
  joinGameSession,
  leaveGameSession,
} from "../platform/commands/hubAdmin";

interface Props {
  channelId: string;
  installedGames: InstalledGame[];
  publicKey: string | null;
  canStartGame: boolean;
  onLaunchGame: (game: InstalledGame, sessionId: string) => void;
}

export function GameSessionPanel({ channelId, installedGames, publicKey, canStartGame, onLaunchGame }: Props) {
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void reload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  async function reload() {
    setLoading(true);
    try {
      const s = await listGameSessions(channelId);
      setSessions(s);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleStart(gameId: string) {
    try {
      const { session_id } = await createGameSession(gameId, channelId);
      await reload();
      const game = installedGames.find((g) => g.id === gameId);
      if (game) onLaunchGame(game, session_id);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleJoin(session: GameSession) {
    try {
      await joinGameSession(session.session_id);
      const game = installedGames.find((g) => g.id === session.game_id);
      if (game) onLaunchGame(game, session.session_id);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleLeave(sessionId: string) {
    try {
      await leaveGameSession(sessionId);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  }

  const liveSessions = sessions.filter((s) => s.status === "lobby" || s.status === "in_progress");
  const multiplayerGames = installedGames; // all installed games for this channel

  return (
    <div className="game-session-panel">
      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted">Loading sessions…</p>}

      {liveSessions.length > 0 && (
        <div className="game-sessions-list">
          <h4>Live sessions</h4>
          {liveSessions.map((s) => {
            const game = installedGames.find((g) => g.id === s.game_id);
            const amPlayer = s.players.some((p) => p.pubkey === publicKey);
            return (
              <div key={s.session_id} className="game-session-row">
                <div className="game-session-info">
                  <strong>{game?.name ?? s.game_id}</strong>
                  <span className="muted session-status">
                    {s.status === "lobby" ? "Lobby" : "In progress"}
                    {" · "}{s.players.length}/{s.max_players} players
                    {" · "}{formatRelative(s.created_at)}
                  </span>
                </div>
                <div className="game-session-actions">
                  {amPlayer ? (
                    <>
                      <button onClick={() => game && onLaunchGame(game, s.session_id)}>Rejoin</button>
                      <button className="btn-secondary" onClick={() => handleLeave(s.session_id)}>Leave</button>
                    </>
                  ) : (
                    s.players.length < s.max_players && (
                      <button onClick={() => handleJoin(s)}>Join</button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canStartGame && multiplayerGames.length > 0 && liveSessions.length === 0 && (
        <div className="game-start-list">
          <h4>Start a game</h4>
          {multiplayerGames.map((g) => (
            <div key={g.id} className="game-start-row">
              {g.thumbnail_url && (
                <img src={g.thumbnail_url} alt={g.name} style={{ width: 32, height: 32, objectFit: "cover" }} />
              )}
              <span style={{ flex: 1 }}>{g.name}</span>
              <button onClick={() => handleStart(g.id)}>Start</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
