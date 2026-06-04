import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { InstalledGame } from "../types";
import { FocusTrap } from "./FocusTrap";

interface Props {
  game: InstalledGame;
  theme: string;
  publicKey: string | null;
  displayName: string | null;
  avatar: string | null;
  channelId: string | null;
  channelName: string | null;
  hubName: string | null;
  hubPubkey: string | null;
  sessionId?: string | null;
  onClose: () => void;
}

function hasCapability(game: InstalledGame, cap: string): boolean {
  return (game.permissions ?? []).includes(cap);
}

function disclosureText(game: InstalledGame): string {
  const perms = game.permissions ?? [];
  const parts: string[] = [];
  if (perms.includes("post_message")) parts.push("post messages as you");
  if (perms.includes("read_channel_history")) parts.push("read recent messages");
  if (perms.includes("list_channel_users")) parts.push("see channel users");
  if (parts.length === 0) return "";
  return `This game can: ${parts.join(", ")}.`;
}

export function GameModal({ game, theme, publicKey, displayName, avatar, channelId, channelName, hubName, hubPubkey, sessionId, onClose }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const autoZoneIdRef = useRef<string | null>(null);

  const src = (() => {
    const url = new URL(game.entry_url);
    url.searchParams.set("theme", theme);
    if (sessionId) url.searchParams.set("session", sessionId);
    return url.toString();
  })();

  useEffect(() => {
    function reply(data: unknown) {
      const frame = iframeRef.current;
      if (!frame?.contentWindow) return;
      frame.contentWindow.postMessage(data, "*");
    }

    function capError(type: string) {
      reply({ type, error: "capability_not_granted" });
    }

    async function onMessage(e: MessageEvent) {
      const msg = e.data;
      if (!msg?.type) return;

      switch (msg.type) {
        case "voxply:getUser":
          reply({ type: "voxply:user", data: { public_key: publicKey, display_name: displayName, avatar } });
          break;

        case "voxply:getContext":
          reply({
            type: "voxply:context",
            data: {
              hub_name: hubName,
              hub_pubkey: hubPubkey,
              channel_id: channelId,
              channel_name: channelName,
              session_id: sessionId ?? null,
            },
          });
          break;

        case "voxply:getChannelUsers":
          if (!hasCapability(game, "list_channel_users")) { capError("voxply:channelUsers"); return; }
          try {
            const users = await invoke<{ pubkey: string; display_name: string | null }[]>("game_list_channel_users", { channelId });
            reply({ type: "voxply:channelUsers", data: users });
          } catch (err) {
            reply({ type: "voxply:channelUsers", error: String(err) });
          }
          break;

        case "voxply:postMessage":
          if (!hasCapability(game, "post_message")) { capError("voxply:postMessageResult"); return; }
          try {
            await invoke("game_post_message", { channelId, content: msg.body?.content ?? "" });
            reply({ type: "voxply:postMessageResult", ok: true });
          } catch (err) {
            reply({ type: "voxply:postMessageResult", error: String(err) });
          }
          break;

        case "voxply:getRecentMessages":
          if (!hasCapability(game, "read_channel_history")) { capError("voxply:recentMessages"); return; }
          try {
            const msgs = await invoke<unknown[]>("game_get_recent_messages", { channelId, limit: msg.body?.limit ?? 50 });
            reply({ type: "voxply:recentMessages", data: msgs });
          } catch (err) {
            reply({ type: "voxply:recentMessages", error: String(err) });
          }
          break;

        case "voxply:kvGet":
          try {
            const value = await invoke<string | null>("game_kv_get", { gameId: game.id, key: msg.body?.key });
            reply({ type: "voxply:kvValue", key: msg.body?.key, value });
          } catch (err) {
            reply({ type: "voxply:kvValue", key: msg.body?.key, error: String(err) });
          }
          break;

        case "voxply:kvSet":
          try {
            await invoke("game_kv_set", { gameId: game.id, key: msg.body?.key, value: msg.body?.value });
            reply({ type: "voxply:kvSetResult", key: msg.body?.key, ok: true });
          } catch (err) {
            reply({ type: "voxply:kvSetResult", key: msg.body?.key, error: String(err) });
          }
          break;

        case "voxply:game:createSession":
          try {
            const sess = await invoke("game_create_session", { gameId: game.id, channelId });
            reply({ type: "voxply:game:sessionCreated", data: sess });
          } catch (err) {
            reply({ type: "voxply:game:error", action: "createSession", error: String(err) });
          }
          break;

        case "voxply:game:joinSession":
          try {
            await invoke("game_join_session", { sessionId: msg.body?.session_id });
            reply({ type: "voxply:game:sessionJoined", session_id: msg.body?.session_id });
          } catch (err) {
            reply({ type: "voxply:game:error", action: "joinSession", error: String(err) });
          }
          break;

        case "voxply:game:broadcastMove":
          try {
            await invoke("game_broadcast_move", { sessionId: msg.body?.session_id, state: msg.body?.state });
            reply({ type: "voxply:game:moveSent" });
          } catch (err) {
            reply({ type: "voxply:game:error", action: "broadcastMove", error: String(err) });
          }
          break;

        case "voxply:game:getState":
          try {
            const state = await invoke("game_get_state", { sessionId: msg.body?.session_id });
            reply({ type: "voxply:game:stateResult", data: state });
          } catch (err) {
            reply({ type: "voxply:game:error", action: "getState", error: String(err) });
          }
          break;

        case "voxply:game:endSession":
          try {
            await invoke("game_end_session", { sessionId: msg.body?.session_id });
            reply({ type: "voxply:game:sessionEnded" });
          } catch (err) {
            reply({ type: "voxply:game:error", action: "endSession", error: String(err) });
          }
          break;

        case "voxply:createVoiceZone": {
          if (!sessionId) {
            reply({ type: "voxply:error", reqId: msg.reqId, code: "not_in_voice" });
            break;
          }
          const zoneId = typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `zone-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          autoZoneIdRef.current = zoneId;
          const zonePayload = JSON.stringify({
            type: "voice_zone_create",
            zone_id: zoneId,
            name: "game-world",
            coordinate_system: msg.coordinate_system ?? "2d",
            attenuation: msg.attenuation ?? { model: "linear", max_radius: 200 },
            auth_mode: "session_roster",
            session_id: sessionId,
          });
          try {
            await invoke("send_hub_ws_raw", { payload: zonePayload });
            reply({ type: "voxply:voiceZoneCreated", reqId: msg.reqId, data: { zone_id: zoneId } });
          } catch (err) {
            reply({ type: "voxply:error", reqId: msg.reqId, code: String(err) });
          }
          break;
        }

        case "voxply:setVoicePosition": {
          const resolvedZoneId = msg.zone_id === "auto" ? autoZoneIdRef.current : (msg.zone_id as string | null);
          if (!resolvedZoneId) {
            reply({ type: "voxply:error", reqId: msg.reqId, code: "not_in_zone" });
            break;
          }
          const pos = msg.position as { x: number; y: number; z?: number };
          const posArray: number[] = pos.z !== undefined ? [pos.x, pos.y, pos.z] : [pos.x, pos.y];
          try {
            await invoke("set_voice_position", { zoneId: resolvedZoneId, position: posArray });
            const updatePayload = JSON.stringify({
              type: "voice_position_update",
              zone_id: resolvedZoneId,
              position: posArray,
            });
            await invoke("send_hub_ws_raw", { payload: updatePayload });
            reply({ type: "voxply:ok", reqId: msg.reqId });
          } catch (err) {
            reply({ type: "voxply:error", reqId: msg.reqId, code: String(err) });
          }
          break;
        }

        default:
          break;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [publicKey, displayName, avatar, channelId, channelName, hubName, hubPubkey, sessionId, game]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ zone_id: string; pubkey: string; position: number[] }>("voice-position-updated", (event) => {
      const frame = iframeRef.current;
      if (!frame?.contentWindow) return;
      frame.contentWindow.postMessage({
        type: "voxply:voicePositionUpdated",
        data: { pubkey: event.payload.pubkey, position: event.payload.position },
      }, "*");
    }).then((u) => { unlisten = u; });
    return () => { unlisten?.(); };
  }, []);

  const disclosure = disclosureText(game);

  return (
    <div className="game-modal-overlay">
      <FocusTrap>
        <div className="game-modal">
          <div className="game-modal-titlebar">
            <span className="game-modal-title">{game.name}</span>
            <button className="game-modal-close" onClick={onClose} title="Close">×</button>
          </div>
          {disclosure && (
            <div className="game-disclosure-strip" title={disclosure}>
              🛡 {disclosure}
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
