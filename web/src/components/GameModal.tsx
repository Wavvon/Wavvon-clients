import { useEffect, useRef, useState } from "react";
import type { InstalledGame, InstalledGameAdmin, Message } from "../types";
import { FocusTrap } from "./FocusTrap";
import { hubFetch } from "../platform/http";

interface Props {
  game: InstalledGame;
  gameAdmin?: InstalledGameAdmin | null;
  theme: string;
  publicKey: string | null;
  displayName: string | null;
  avatar: string | null;
  channelId?: string | null;
  channelName?: string | null;
  hubId?: string | null;
  hubName?: string | null;
  farmUrl?: string | null;
  channelUsers?: { public_key: string; display_name: string | null; online: boolean }[];
  recentMessages?: Message[];
  onClose: () => void;
  onPostMessage?: (text: string) => Promise<void>;
}

export function GameModal({
  game, gameAdmin, theme, publicKey, displayName, avatar,
  channelId = null, channelName = null, hubId = null, hubName = null, farmUrl = null,
  channelUsers = [], recentMessages = [],
  onClose, onPostMessage,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [permsDismissed, setPermsDismissed] = useState(false);

  const grantedPerms = new Set(gameAdmin?.permissions ?? []);
  const hasAnyGrant = grantedPerms.size > 0;

  const src = (() => {
    try {
      const url = new URL(game.entry_url);
      url.searchParams.set("theme", theme);
      return url.toString();
    } catch {
      return game.entry_url;
    }
  })();

  function reply(reqId: unknown, type: string, data: unknown) {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage({ type, reqId, data }, "*");
  }

  function replyError(reqId: unknown, code: string) {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage({ type: "voxply:error", reqId, code }, "*");
  }

  useEffect(() => {
    async function onMessage(e: MessageEvent) {
      const msg = e.data;
      if (typeof msg?.type !== "string" || !msg.type.startsWith("voxply:")) return;
      const reqId = msg.reqId;

      switch (msg.type) {
        case "voxply:getUser":
          reply(reqId, "voxply:user", { public_key: publicKey, display_name: displayName, avatar });
          break;

        case "voxply:getContext":
          reply(reqId, "voxply:context", {
            hub: hubId ? { id: hubId, name: hubName, icon_url: null } : null,
            channel: channelId ? { id: channelId, name: channelName } : null,
            farm: farmUrl ? { url: farmUrl } : null,
          });
          break;

        case "voxply:getChannelUsers":
          if (!grantedPerms.has("list_channel_users")) { replyError(reqId, "permission_denied"); break; }
          reply(reqId, "voxply:channelUsers", { users: channelUsers });
          break;

        case "voxply:postMessage":
          if (!grantedPerms.has("post_message")) { replyError(reqId, "permission_denied"); break; }
          if (onPostMessage && typeof msg.text === "string") {
            try {
              await onPostMessage(msg.text);
              reply(reqId, "voxply:posted", { message_id: null });
            } catch {
              replyError(reqId, "rate_limited");
            }
          }
          break;

        case "voxply:getRecentMessages":
          if (!grantedPerms.has("read_channel_history")) { replyError(reqId, "permission_denied"); break; }
          reply(reqId, "voxply:recentMessages", {
            messages: recentMessages.slice(0, Math.min(msg.limit ?? 50, 100)).map((m) => ({
              id: m.id,
              author_pubkey: m.sender,
              author_display: m.sender_name,
              text: m.content,
              ts: m.created_at,
            })),
          });
          break;

        case "voxply:kvGet":
          try {
            const r = await hubFetch(`/games/${game.id}/kv/${encodeURIComponent(String(msg.key))}`);
            const val = await r.json() as { value: unknown };
            reply(reqId, "voxply:kvValue", { key: msg.key, value: val.value ?? null });
          } catch {
            reply(reqId, "voxply:kvValue", { key: msg.key, value: null });
          }
          break;

        case "voxply:kvSet":
          try {
            await hubFetch(`/games/${game.id}/kv`, {
              method: "PUT",
              body: JSON.stringify({ key: msg.key, value: msg.value }),
            });
            reply(reqId, "voxply:kvOk", null);
          } catch (err) {
            const errMsg = String(err);
            replyError(reqId, errMsg.includes("quota") ? "quota_exceeded" : "error");
          }
          break;

        default:
          break;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [publicKey, displayName, avatar, channelId, channelName, hubId, hubName, farmUrl,
      channelUsers, recentMessages, game.id, grantedPerms, onPostMessage]);

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
        <div className="game-modal" role="dialog" aria-modal="true" aria-label={game.name}>
          <div className="game-modal-titlebar">
            <span className="game-modal-title">{game.name}</span>
            <button className="game-modal-close" onClick={onClose} title="Close" aria-label="Close">×</button>
          </div>
          {hasAnyGrant && !permsDismissed && (
            <div className="game-permissions-strip">
              <span>
                This game can:{" "}
                {[...grantedPerms].map((p) => PERM_LABELS[p] ?? p).join(", ")}.
              </span>
              <button className="btn-ghost" onClick={() => setPermsDismissed(true)} aria-label="Dismiss" title="Dismiss">×</button>
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

const PERM_LABELS: Record<string, string> = {
  post_message: "post messages as you",
  read_channel_history: "read recent messages",
  list_channel_users: "see who is online here",
};
