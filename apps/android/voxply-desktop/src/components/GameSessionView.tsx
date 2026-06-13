import React, { useEffect, useRef, useState } from "react";
import type { GameSession, InstalledGame } from "../types";

interface Props {
  game: InstalledGame;
  session: GameSession | null;
  hubUrl: string;
  channelId: string;
  publicKey: string | null;
  displayName: string | null;
  avatar: string | null;
  theme: string;
  permissions: string[];
  onSessionChange: (s: GameSession | null) => void;
  onClose: () => void;
  onWsMessage: (handler: (msg: unknown) => void) => () => void;
  onWsSend: (msg: unknown) => void;
  onPostMessage: (text: string) => void;
  recentMessages: import("../types").Message[];
  channelUsers: { public_key: string; display_name: string | null; online: boolean }[];
}

export function GameSessionView({
  game, session, hubUrl, channelId, publicKey, displayName, avatar, theme,
  permissions, onSessionChange, onClose, onWsMessage, onWsSend,
  onPostMessage, recentMessages, channelUsers,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [joining, setJoining] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const src = (() => {
    const url = new URL(game.entry_url);
    url.searchParams.set("theme", theme);
    return url.toString();
  })();

  function replyToFrame(msg: unknown) {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage(msg, "*");
  }

  useEffect(() => {
    const unlisten = onWsMessage((raw) => {
      const d = raw as Record<string, unknown>;
      if (!d || typeof d.type !== "string") return;
      if (!d.type.startsWith("game_")) return;
      if ((d.session_id as string | undefined) !== session?.session_id) return;

      if (d.type === "game_event") {
        replyToFrame({ type: "voxply:game:event", from: d.from_pubkey, payload: d.payload });
      } else if (d.type === "game_player_joined") {
        replyToFrame({ type: "voxply:game:playerJoined", pubkey: d.pubkey, display_name: d.display_name });
      } else if (d.type === "game_player_left") {
        replyToFrame({ type: "voxply:game:playerLeft", pubkey: d.pubkey, display_name: d.display_name });
      } else if (d.type === "game_host_changed") {
        if (d.new_host_pubkey === publicKey) {
          replyToFrame({ type: "voxply:game:youAreHost" });
        }
      } else if (d.type === "game_session_ended") {
        replyToFrame({ type: "voxply:game:ended", reason: d.reason });
        onSessionChange(null);
      }
    });
    return unlisten;
  }, [session?.session_id, publicKey, onWsMessage, onSessionChange]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data;
      if (!d || typeof d.type !== "string" || !d.type.startsWith("voxply:game:")) return;
      if (!session) return;

      if (d.type === "voxply:game:ready") {
        replyToFrame({
          type: "voxply:game:state",
          session_id: session.session_id,
          status: session.status,
          players: session.players,
          is_host: session.host_pubkey === publicKey,
        });
        return;
      }
      if (d.type === "voxply:game:send") {
        onWsSend({ type: "game_send", session_id: session.session_id, payload: d.payload, to: d.to });
        return;
      }
      if (d.type === "voxply:game:start") {
        onWsSend({ type: "game_set_status", session_id: session.session_id, status: "in_progress" });
        return;
      }
      if (d.type === "voxply:game:end") {
        onWsSend({ type: "game_end", session_id: session.session_id, result: d.result });
        return;
      }
      if (d.type === "voxply:game:snapshot") {
        onWsSend({ type: "game_snapshot", session_id: session.session_id, blob: d.blob });
        return;
      }
      if (d.type === "voxply:game:sharedKvGet") {
        fetchSharedKv(d.key, d.reqId);
        return;
      }
      if (d.type === "voxply:game:sharedKvSet") {
        setSharedKv(d.key, d.value, d.reqId);
        return;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [session, publicKey, onWsSend]);

  async function fetchSharedKv(key: string, reqId: unknown) {
    if (!session) return;
    try {
      const res = await fetch(`${hubUrl}/games/sessions/${session.session_id}/kv/${encodeURIComponent(key)}`);
      const data = res.ok ? await res.json() : { value: null };
      replyToFrame({ type: "voxply:game:sharedKvValue", reqId, key, value: data.value });
    } catch {
      replyToFrame({ type: "voxply:game:sharedKvValue", reqId, key, value: null });
    }
  }

  async function setSharedKv(key: string, value: unknown, reqId: unknown) {
    if (!session) return;
    try {
      await fetch(`${hubUrl}/games/sessions/${session.session_id}/kv/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      replyToFrame({ type: "voxply:game:sharedKvOk", reqId });
    } catch {
      replyToFrame({ type: "voxply:error", reqId, code: "server_error" });
    }
  }

  async function createSession() {
    setStarting(true);
    setError("");
    try {
      const res = await fetch(`${hubUrl}/games/${game.id}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: GameSession = await res.json();
      onSessionChange(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(false);
    }
  }

  async function joinSession() {
    if (!session) return;
    setJoining(true);
    setError("");
    try {
      const res = await fetch(`${hubUrl}/games/sessions/${session.session_id}/join`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: GameSession = await res.json();
      onSessionChange(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setJoining(false);
    }
  }

  async function leaveSession() {
    if (!session) return;
    try {
      await fetch(`${hubUrl}/games/sessions/${session.session_id}/leave`, { method: "POST" });
      onSessionChange(null);
    } catch { /* ignore */ }
    onClose();
  }

  const inSession = session && session.players.some((p) => p.pubkey === publicKey);

  return (
    <div className="game-modal-overlay">
      <div className="game-modal">
        <div className="game-modal-titlebar">
          <span className="game-modal-title">{game.name}</span>
          <button className="game-modal-close" onClick={onClose} title="Close">×</button>
        </div>

        {error && <p className="error-text" style={{ margin: "4px 12px" }}>{error}</p>}

        {!inSession && (
          <div className="game-session-lobby">
            {session ? (
              <>
                <p className="muted">Session active ({session.players.length} player{session.players.length !== 1 ? "s" : ""})</p>
                <button className="btn-primary" onClick={joinSession} disabled={joining}>
                  {joining ? "Joining…" : "Join session"}
                </button>
              </>
            ) : (
              <button className="btn-primary" onClick={createSession} disabled={starting}>
                {starting ? "Starting…" : "Start session"}
              </button>
            )}
          </div>
        )}

        {inSession && (
          <>
            {permissions.length > 0 && (
              <div className="game-permissions-strip muted">
                This game can: {permissions.join(", ")}
              </div>
            )}
            <iframe
              ref={iframeRef}
              className="game-modal-frame"
              src={src}
              title={game.name}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
            <button className="btn-secondary game-leave-btn" onClick={leaveSession} style={{ margin: 8 }}>
              Leave session
            </button>
          </>
        )}
      </div>
    </div>
  );
}
