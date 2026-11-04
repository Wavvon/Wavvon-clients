import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ScreenShareViewerRef, ShareQuality, StreamLimits } from "@wavvon/ui";
import { activeSession, get_hub_ws_info } from "@platform";
import { WebScreenShareSession } from "../platform/screenShare";
import type { ActiveStream, HubStreamInfo } from "../types";

interface UseScreenShareParams {
  activeHubIdRef: React.MutableRefObject<string | null>;
  showHubError: (msg: string) => void;
}

// Outbound screen share (chunk transport), the lives announced to us, and
// which of them we opened. Nothing opens by itself (#259): opening sends
// `stream_subscribe`, closing `stream_unsubscribe`, and the viewer only
// renders opened streams, so on a hub without `screenshare.onrequest` the
// chunks of a closed live are dropped here instead of at the hub.
export function useScreenShare({ activeHubIdRef, showHubError }: UseScreenShareParams) {
  const screenShareViewerRef = useRef<ScreenShareViewerRef | null>(null);
  const [liveStreams, setLiveStreams] = useState<(ActiveStream & { channel_id: string })[]>([]);
  const [openedIds, setOpenedIds] = useState<Set<string>>(new Set());
  // Opened, by stream id, with the channel the subscribe names.
  const requested = useRef<Map<string, string>>(new Map());
  const screenShareSessionRef = useRef<WebScreenShareSession | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareKbps, setShareKbps] = useState(0);
  const [shareLocalStream, setShareLocalStream] = useState<MediaStream | null>(null);
  const [hubStreams, setHubStreams] = useState<HubStreamInfo[]>([]);
  const [showHubStreams, setShowHubStreams] = useState(false);
  // The channel the share dialog is open for; the share starts once it closes.
  const [shareDialogFor, setShareDialogFor] = useState<string | null>(null);

  // Per-instance teardown on unmount (key-remounted account switch etc.);
  // module-level WS sessions are reset separately by AccountRoot.
  useEffect(() => {
    return () => {
      screenShareSessionRef.current?.stop();
    };
  }, []);

  function handleStartShare(channelId: string) {
    if (!sharing) setShareDialogFor(channelId);
  }

  // Stable, so the dialog fetches once per opening.
  const loadStreamLimits = useCallback(async (): Promise<StreamLimits | undefined> => {
    const res = await fetch(`${get_hub_ws_info().hub_url.replace(/\/+$/, "")}/info`);
    return ((await res.json()) as { stream_limits?: StreamLimits }).stream_limits;
  }, []);

  async function handleShareChosen(quality: ShareQuality) {
    const channelId = shareDialogFor;
    setShareDialogFor(null);
    if (sharing || !channelId) return;
    const ws = activeSession().ws;
    if (!ws) { showHubError("Not connected"); return; }
    const session = new WebScreenShareSession(ws, channelId, {
      onBitrate: (kbps) => setShareKbps(kbps),
      onEnded: () => {
        screenShareSessionRef.current = null;
        setSharing(false);
        setShareKbps(0);
        setShareLocalStream(null);
      },
      onError: (msg) => showHubError("Screen share: " + msg),
    });
    try {
      await session.start(quality);
      screenShareSessionRef.current = session;
      setSharing(true);
      setShareLocalStream(session.getStream());
    } catch (e) {
      // getDisplayMedia rejects when the user cancels the picker — not an error.
      const msg = e instanceof Error ? e.message : String(e);
      if (!/denied|cancel|aborted|not allowed/i.test(msg)) showHubError("Screen share: " + msg);
    }
  }

  function handleStopShare() {
    screenShareSessionRef.current?.stop();
    screenShareSessionRef.current = null;
    setSharing(false);
    setShareKbps(0);
    setShareLocalStream(null);
  }

  function handleOpenHubStreams() {
    try { activeSession().ws?.requestStreamList(); } catch { /* ws not ready */ }
    setShowHubStreams(true);
  }
  function handleWatchStream(channelId: string, streamId: string) {
    requested.current.set(streamId, channelId);
    setOpenedIds((prev) => new Set(prev).add(streamId));
  }
  function handleStopWatchStream(_channelId: string, streamId: string) {
    const channelId = requested.current.get(streamId);
    requested.current.delete(streamId);
    if (channelId) {
      try { activeSession().ws?.unsubscribeStream(channelId, streamId); } catch { /* ws not ready */ }
    }
    setOpenedIds((prev) => { const next = new Set(prev); next.delete(streamId); return next; });
    screenShareViewerRef.current?.stopStream(streamId);
  }

  // Subscribe after the commit that rendered the opened stream, so the viewer
  // already holds a MediaSource when the replayed init segment arrives.
  const sent = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const id of openedIds) {
      if (sent.current.has(id)) continue;
      const channelId = requested.current.get(id);
      if (!channelId) continue;
      sent.current.add(id);
      try { activeSession().ws?.subscribeStream(channelId, id); } catch { /* ws not ready */ }
    }
    for (const id of sent.current) if (!openedIds.has(id)) sent.current.delete(id);
  }, [openedIds]);

  function resubscribeStreams() {
    for (const [id, channelId] of requested.current) {
      try { activeSession().ws?.subscribeStream(channelId, id); } catch { /* ws not ready */ }
    }
  }

  function forget(streamId: string) {
    requested.current.delete(streamId);
    setOpenedIds((prev) => { if (!prev.has(streamId)) return prev; const next = new Set(prev); next.delete(streamId); return next; });
    setLiveStreams((prev) => prev.filter((s) => s.stream_id !== streamId));
    screenShareViewerRef.current?.stopStream(streamId);
  }

  const activeScreenShares = useMemo(
    () => liveStreams.filter((s) => openedIds.has(s.stream_id)),
    [liveStreams, openedIds],
  );

  // WS arm — plugged into App's handler registry.
  function onScreenShare(raw: unknown) {
    const m = raw as Record<string, unknown>;
    if (m._hub_id !== activeHubIdRef.current) return;
    if (m.type === "screen_share_started") {
      const ev = m as unknown as ActiveStream & { channel_id: string; _hub_id: string };
      setLiveStreams((prev) => {
        if (prev.some((s) => s.stream_id === ev.stream_id)) return prev;
        return [...prev, { channel_id: ev.channel_id, stream_id: ev.stream_id, sharer_pubkey: ev.sharer_pubkey, kind: ev.kind, mime: ev.mime, has_audio: ev.has_audio }];
      });
      // Keep the cross-channel discovery list live.
      setHubStreams((prev) => prev.some((s) => s.stream_id === ev.stream_id) ? prev : [...prev, {
        channel_id: ev.channel_id, stream_id: ev.stream_id, sharer_pubkey: ev.sharer_pubkey, kind: ev.kind, mime: ev.mime, has_audio: ev.has_audio,
      }]);
    } else if (m.type === "screen_share_stopped") {
      const streamId = m.stream_id as string;
      forget(streamId);
      setHubStreams((prev) => prev.filter((s) => s.stream_id !== streamId));
    } else if (m.type === "hub_streams") {
      setHubStreams((m.streams as HubStreamInfo[]) ?? []);
    } else if (m.type === "stream_subscribed") {
      // A cross-channel stream may not have been announced to us.
      const streamId = m.stream_id as string;
      setLiveStreams((prev) => prev.some((s) => s.stream_id === streamId) ? prev : [...prev, {
        channel_id: m.source_channel_id as string,
        stream_id: streamId,
        sharer_pubkey: m.sharer_pubkey as string,
        kind: (m.kind as "screen" | "webcam") ?? "screen",
        mime: m.mime as string,
        has_audio: !!m.has_audio,
      }]);
    } else if (m.type === "stream_subscription_ended") {
      forget(m.stream_id as string);
    }
  }

  function onScreenShareChunk(streamId: string, isInit: boolean, data: ArrayBuffer) {
    screenShareViewerRef.current?.appendChunk(streamId, isInit, data);
  }

  return {
    screenShareViewerRef,
    activeScreenShares,
    liveStreams,
    openedIds,
    sharing,
    shareKbps,
    shareLocalStream,
    hubStreams,
    showHubStreams,
    setShowHubStreams,
    handleStartShare,
    shareDialogFor,
    setShareDialogFor,
    loadStreamLimits,
    handleShareChosen,
    handleStopShare,
    handleOpenHubStreams,
    handleWatchStream,
    handleStopWatchStream,
    onScreenShare,
    onScreenShareChunk,
    resubscribeStreams,
  };
}
