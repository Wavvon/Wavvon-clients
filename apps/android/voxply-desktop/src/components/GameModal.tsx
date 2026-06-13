import { useEffect, useRef } from "react";
import type { InstalledGame, Message } from "../types";
import { FocusTrap } from "./FocusTrap";

interface Props {
  game: InstalledGame;
  theme: string;
  publicKey: string | null;
  displayName: string | null;
  avatar: string | null;
  hubUrl: string;
  hubId: string;
  hubName: string;
  channelId: string | null;
  channelName: string | null;
  farmUrl: string | null;
  permissions: string[];
  recentMessages: Message[];
  channelUsers: { public_key: string; display_name: string | null; online: boolean }[];
  onPostMessage: (text: string) => void;
  onClose: () => void;
}

export function GameModal({
  game, theme, publicKey, displayName, avatar,
  hubUrl, hubId, hubName, channelId, channelName, farmUrl,
  permissions, recentMessages, channelUsers,
  onPostMessage, onClose,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

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
    function onMessage(e: MessageEvent) {
      const d = e.data;
      if (!d || typeof d.type !== "string") return;
      const reqId = d.reqId;

      if (d.type === "voxply:getUser") {
        replyToFrame({
          type: "voxply:user",
          reqId,
          data: { public_key: publicKey, display_name: displayName, avatar },
        });
        return;
      }

      if (d.type === "voxply:getContext") {
        replyToFrame({
          type: "voxply:context",
          reqId,
          data: {
            hub: { id: hubId, name: hubName, icon_url: null },
            channel: channelId ? { id: channelId, name: channelName } : null,
            farm: farmUrl ? { url: farmUrl } : null,
          },
        });
        return;
      }

      if (d.type === "voxply:getChannelUsers") {
        if (!permissions.includes("list_channel_users")) {
          replyToFrame({ type: "voxply:error", reqId, code: "permission_denied" });
          return;
        }
        replyToFrame({ type: "voxply:channelUsers", reqId, data: { users: channelUsers } });
        return;
      }

      if (d.type === "voxply:postMessage") {
        if (!permissions.includes("post_message")) {
          replyToFrame({ type: "voxply:error", reqId, code: "permission_denied" });
          return;
        }
        if (typeof d.text === "string" && d.text.trim()) {
          onPostMessage(d.text);
          replyToFrame({ type: "voxply:posted", reqId, data: { message_id: null } });
        }
        return;
      }

      if (d.type === "voxply:getRecentMessages") {
        if (!permissions.includes("read_channel_history")) {
          replyToFrame({ type: "voxply:error", reqId, code: "permission_denied" });
          return;
        }
        const limit = Math.min(d.limit ?? 50, 100);
        const msgs = recentMessages.slice(-limit).map((m) => ({
          id: m.id,
          author_pubkey: m.sender,
          author_display: m.sender_name,
          text: m.content,
          ts: m.created_at,
        }));
        replyToFrame({ type: "voxply:recentMessages", reqId, data: { messages: msgs } });
        return;
      }

      if (d.type === "voxply:kvGet") {
        const kvKey = `voxply:kv:${game.id}:${publicKey}:${d.key}`;
        const value = (() => {
          try { return JSON.parse(localStorage.getItem(kvKey) ?? "null"); }
          catch { return null; }
        })();
        replyToFrame({ type: "voxply:kvValue", reqId, data: { key: d.key, value } });
        return;
      }

      if (d.type === "voxply:kvSet") {
        const kvKey = `voxply:kv:${game.id}:${publicKey}:${d.key}`;
        try {
          localStorage.setItem(kvKey, JSON.stringify(d.value));
          replyToFrame({ type: "voxply:kvOk", reqId });
        } catch {
          replyToFrame({ type: "voxply:error", reqId, code: "quota_exceeded" });
        }
        return;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [publicKey, displayName, avatar, hubId, hubName, channelId, channelName, farmUrl, permissions, recentMessages, channelUsers, onPostMessage, game.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="game-modal-overlay">
      <FocusTrap>
      <div className="game-modal" role="dialog" aria-modal="true" aria-label={game.name}>
        <div className="game-modal-titlebar">
          <span className="game-modal-title">{game.name}</span>
          <button className="game-modal-close" onClick={onClose} title="Close" aria-label="Close">×</button>
        </div>
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
      </div>
      </FocusTrap>
    </div>
  );
}
