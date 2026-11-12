import { useEffect, useRef, useState, type RefObject } from "react";
import { listen } from "@tauri-apps/api/event";
import { parseHubInput } from "@wavvon/core";
import type { Channel, Hub } from "../types";
import type { useChannelMessages } from "./useChannelMessages";
import type { useDms } from "./useDms";
import type { useHubLifecycle } from "./useHubLifecycle";
import type { useAddHubFlow } from "./useAddHubFlow";

interface DeepLinkParams {
  hubsRef: RefObject<Hub[]>;
  activeHubId: string | null;
  channels: Channel[];
  channelMessages: ReturnType<typeof useChannelMessages>;
  setView: ReturnType<typeof useDms>["setView"];
  handleSwitchHub: ReturnType<typeof useHubLifecycle>["handleSwitchHub"];
  setHubUrl: ReturnType<typeof useAddHubFlow>["setHubUrl"];
  setInviteCode: ReturnType<typeof useAddHubFlow>["setInviteCode"];
  setShowAddHub: ReturnType<typeof useAddHubFlow>["setShowAddHub"];
}

export function useDeepLink({
  hubsRef,
  activeHubId,
  channels,
  channelMessages,
  setView,
  handleSwitchHub,
  setHubUrl,
  setInviteCode,
  setShowAddHub,
}: DeepLinkParams) {
  // wavvon:// links (issue #385). A channel or message link for a hub already
  // joined opens that channel; anything else (an invite, an unknown hub)
  // opens add-hub on it. The target is applied once the hub's channels have
  // loaded, by the effect below.
  const [pendingLinkTarget, setPendingLinkTarget] = useState<
    { hubId: string; channelId: string; messageId?: string } | null
  >(null);
  function routeDeepLink(url: string, joined: Hub[]) {
    const parsed = parseHubInput(url);
    if (!parsed) return;
    const host = (u: string) => { try { return new URL(u).host.toLowerCase(); } catch { return ""; } };
    const hub = parsed.target ? joined.find((h) => host(h.hub_url) === host(parsed.hubUrl)) : undefined;
    if (hub && parsed.target) {
      setPendingLinkTarget({
        hubId: hub.hub_id,
        channelId: parsed.target.channelId,
        messageId: parsed.target.kind === "message" ? parsed.target.messageId : undefined,
      });
      setView("channels");
      void handleSwitchHub(hub.hub_id);
      return;
    }
    setHubUrl(parsed.hubUrl);
    setInviteCode(parsed.inviteCode);
    setShowAddHub(true);
  }
  const routeDeepLinkRef = useRef(routeDeepLink);
  routeDeepLinkRef.current = routeDeepLink;

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    listen<string>("join-hub-requested", (event) => {
      routeDeepLinkRef.current(event.payload, hubsRef.current);
    }).then((fn) => {
      if (cancelled) fn(); else unlisten = fn;
    });
    return () => { cancelled = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    const p = pendingLinkTarget;
    if (!p || activeHubId !== p.hubId) return;
    const ch = channels.find((c) => c.id === p.channelId);
    if (!ch) return;
    if (channelMessages.selectedChannel?.id !== ch.id) {
      channelMessages.selectChannel(ch);
      if (!p.messageId) setPendingLinkTarget(null);
      return;
    }
    if (!p.messageId) { setPendingLinkTarget(null); return; }
    if (channelMessages.messages.some((m) => m.id === p.messageId)) {
      const id = p.messageId;
      requestAnimationFrame(() => channelMessages.scrollToMessage(id));
      setPendingLinkTarget(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLinkTarget, activeHubId, channels, channelMessages.selectedChannel, channelMessages.messages]);

  return { routeDeepLinkRef };
}
