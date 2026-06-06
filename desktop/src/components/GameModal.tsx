import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { InstalledGame, GameSessionDetail } from "../types";
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

        case "voxply:game:ready":
          if (!sessionId) {
            reply({ type: "voxply:game:state", reqId: msg.reqId, error: "no_session" });
            break;
          }
          try {
            const session = await invoke<GameSessionDetail>("game_get_session", { sessionId });
            reply({
              type: "voxply:game:state",
              reqId: msg.reqId,
              data: {
                session_id: session.id,
                status: session.status,
                is_host: session.host_pubkey === publicKey,
                roster: session.players ?? [],
              },
            });
          } catch (err) {
            reply({ type: "voxply:game:state", reqId: msg.reqId, error: String(err) });
          }
          break;

        case "voxply:game:start":
          if (!sessionId) break;
          try {
            await invoke("game_start_session", { sessionId });
          } catch (err) {
            reply({ type: "voxply:game:error", reqId: msg.reqId, action: "start", error: String(err) });
          }
          break;

        case "voxply:game:send":
          if (!sessionId) break;
          try {
            await invoke("game_send_move", { sessionId, payload: msg.payload, to: msg.to ?? null });
          } catch (err) {
            reply({ type: "voxply:game:error", reqId: msg.reqId, action: "send", error: String(err) });
          }
          break;

        case "voxply:game:snapshot":
          if (!sessionId) break;
          try {
            await invoke("game_snapshot", { sessionId, blob: msg.blob });
          } catch (err) {
            reply({ type: "voxply:game:error", reqId: msg.reqId, action: "snapshot", error: String(err) });
          }
          break;

        case "voxply:game:sharedKvGet":
          if (!sessionId) break;
          try {
            const value = await invoke<string | null>("game_shared_kv_get", { sessionId, key: msg.key });
            reply({ type: "voxply:game:kvValue", reqId: msg.reqId, key: msg.key, value });
          } catch (err) {
            reply({ type: "voxply:game:error", reqId: msg.reqId, action: "sharedKvGet", error: String(err) });
          }
          break;

        case "voxply:game:sharedKvSet":
          if (!sessionId) break;
          try {
            await invoke("game_shared_kv_set", { sessionId, key: msg.key, value: msg.value });
            reply({ type: "voxply:game:kvOk", reqId: msg.reqId, key: msg.key });
          } catch (err) {
            reply({ type: "voxply:game:error", reqId: msg.reqId, action: "sharedKvSet", error: String(err) });
          }
          break;

        case "voxply:game:end":
          if (!sessionId) break;
          try {
            await invoke("game_end_session", { sessionId, result: msg.result ?? null });
          } catch (err) {
            reply({ type: "voxply:game:error", reqId: msg.reqId, action: "end", error: String(err) });
          }
          break;

        case "voxply:game:setJoinPolicy":
          if (!sessionId) break;
          try {
            await invoke("game_set_join_policy", { sessionId, joinDuringPlay: msg.join_during_play ?? false });
          } catch (err) {
            reply({ type: "voxply:game:error", reqId: msg.reqId, action: "setJoinPolicy", error: String(err) });
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

  useEffect(() => {
    if (!sessionId) return;

    const unlistens: (() => void)[] = [];

    listen<{ session_id: string; pubkey: string; display_name: string }>("game-player-joined", (event) => {
      if (event.payload.session_id !== sessionId) return;
      const frame = iframeRef.current;
      if (!frame?.contentWindow) return;
      frame.contentWindow.postMessage({
        type: "voxply:game:playerJoined",
        data: { pubkey: event.payload.pubkey, display_name: event.payload.display_name },
      }, "*");
    }).then((u) => unlistens.push(u));

    listen<{ session_id: string; pubkey: string }>("game-player-left", (event) => {
      if (event.payload.session_id !== sessionId) return;
      const frame = iframeRef.current;
      if (!frame?.contentWindow) return;
      frame.contentWindow.postMessage({
        type: "voxply:game:playerLeft",
        data: { pubkey: event.payload.pubkey },
      }, "*");
    }).then((u) => unlistens.push(u));

    listen<{ session_id: string; new_host_pubkey: string }>("game-host-changed", (event) => {
      if (event.payload.session_id !== sessionId) return;
      if (event.payload.new_host_pubkey !== publicKey) return;
      const frame = iframeRef.current;
      if (!frame?.contentWindow) return;
      frame.contentWindow.postMessage({ type: "voxply:game:youAreHost" }, "*");
    }).then((u) => unlistens.push(u));

    listen<{ session_id: string; from_pubkey: string; payload: unknown }>("game-event", (event) => {
      if (event.payload.session_id !== sessionId) return;
      const frame = iframeRef.current;
      if (!frame?.contentWindow) return;
      frame.contentWindow.postMessage({
        type: "voxply:game:event",
        data: { from: event.payload.from_pubkey, payload: event.payload.payload },
      }, "*");
    }).then((u) => unlistens.push(u));

    listen<{ session_id: string; reason: string }>("game-session-ended", (event) => {
      if (event.payload.session_id !== sessionId) return;
      const frame = iframeRef.current;
      if (!frame?.contentWindow) return;
      frame.contentWindow.postMessage({
        type: "voxply:game:ended",
        data: { reason: event.payload.reason },
      }, "*");
    }).then((u) => unlistens.push(u));

    return () => { unlistens.forEach((u) => u()); };
  }, [sessionId, publicKey]);

  const disclosure = disclosureText(game);

  return (
    <div className="game-modal-overlay">
      <FocusTrap>
        <div className="game-modal" role="dialog" aria-modal="true" aria-label={game.name}>
          <div className="game-modal-titlebar">
            <span className="game-modal-title">{game.name}</span>
            <button className="game-modal-close" onClick={onClose} title="Close" aria-label="Close">×</button>
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
