import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { ScreenShareViewer } from "./ScreenShareViewer";
import type { ScreenShareViewerRef } from "./ScreenShareViewer";
import type { ActiveStream } from "../types";

interface Props {
  streams: ActiveStream[];
  mediaOutputDeviceId?: string;
}

function SharerWindow({
  sharerPubkey,
  streams,
  mediaOutputDeviceId,
  viewerRef,
  defaultIndex,
}: {
  sharerPubkey: string;
  streams: ActiveStream[];
  mediaOutputDeviceId?: string;
  viewerRef: React.RefObject<ScreenShareViewerRef | null>;
  defaultIndex: number;
}) {
  const [pos, setPos] = useState(() => ({
    x: window.innerWidth - 500 - 16 - defaultIndex * 30,
    y: window.innerHeight - 310 - 16 - defaultIndex * 30,
  }));
  const [size, setSize] = useState({ w: 500, h: 310 });
  const [minimized, setMinimized] = useState(false);

  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const label = sharerPubkey.length > 8 ? sharerPubkey.slice(0, 8) : sharerPubkey;

  function onHeaderPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  }

  function onHeaderPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
  }

  function onHeaderPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function onResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
  }

  function onResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dx = e.clientX - resizeStart.current.x;
    const dy = e.clientY - resizeStart.current.y;
    setSize({
      w: Math.max(240, resizeStart.current.w + dx),
      h: Math.max(135, resizeStart.current.h + dy),
    });
  }

  function onResizePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  return (
    <div
      className="ss-overlay"
      style={{ left: pos.x, top: pos.y, width: size.w, height: minimized ? undefined : size.h }}
    >
      <div
        className="ss-overlay__header"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
      >
        <span className="ss-overlay__drag-icon">⠿</span>
        <span className="ss-overlay__title">{label}</span>
        <div className="ss-overlay__spacer" />
        <button
          className="ss-overlay__btn"
          title={minimized ? "Expand" : "Minimize"}
          onClick={() => setMinimized((v) => !v)}
        >
          {minimized ? "▴" : "▾"}
        </button>
      </div>
      <div className="ss-overlay__body" style={{ display: minimized ? "none" : undefined }}>
        <ScreenShareViewer
          ref={viewerRef}
          streams={streams}
          mediaOutputDeviceId={mediaOutputDeviceId}
        />
      </div>
      {!minimized && (
        <div
          className="ss-overlay__resize"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
        />
      )}
    </div>
  );
}

export const ScreenShareOverlay = forwardRef<ScreenShareViewerRef, Props>(
  ({ streams, mediaOutputDeviceId }, ref) => {
    const viewerRefsMap = useRef<Map<string, React.RefObject<ScreenShareViewerRef | null>>>(new Map());

    // Group streams by sharer.
    const sharerMap = new Map<string, ActiveStream[]>();
    for (const s of streams) {
      const arr = sharerMap.get(s.sharer_pubkey) ?? [];
      arr.push(s);
      sharerMap.set(s.sharer_pubkey, arr);
    }
    const sharerEntries = [...sharerMap.entries()];

    // Create a stable ref for each sharer on first encounter; clean up gone sharers.
    for (const [pubkey] of sharerEntries) {
      if (!viewerRefsMap.current.has(pubkey)) {
        viewerRefsMap.current.set(pubkey, React.createRef<ScreenShareViewerRef | null>());
      }
    }
    for (const [pubkey] of viewerRefsMap.current) {
      if (!sharerMap.has(pubkey)) viewerRefsMap.current.delete(pubkey);
    }

    // Composite ref: route each call to the viewer that owns that stream_id.
    useImperativeHandle(ref, () => ({
      appendChunk(streamId, isInit, data) {
        const sharer = streams.find((s) => s.stream_id === streamId)?.sharer_pubkey;
        if (sharer) viewerRefsMap.current.get(sharer)?.current?.appendChunk(streamId, isInit, data);
      },
      stopStream(streamId) {
        const sharer = streams.find((s) => s.stream_id === streamId)?.sharer_pubkey;
        if (sharer) viewerRefsMap.current.get(sharer)?.current?.stopStream(streamId);
      },
      attachStream(streamId, stream) {
        const sharer = streams.find((s) => s.stream_id === streamId)?.sharer_pubkey;
        if (sharer) viewerRefsMap.current.get(sharer)?.current?.attachStream(streamId, stream);
      },
    }), [streams]);

    if (streams.length === 0) return null;

    return (
      <>
        {sharerEntries.map(([sharerPubkey, sharerStreams], i) => {
          const viewerRef = viewerRefsMap.current.get(sharerPubkey);
          if (!viewerRef) return null;
          return (
            <SharerWindow
              key={sharerPubkey}
              sharerPubkey={sharerPubkey}
              streams={sharerStreams}
              mediaOutputDeviceId={mediaOutputDeviceId}
              viewerRef={viewerRef}
              defaultIndex={i}
            />
          );
        })}
      </>
    );
  }
);

ScreenShareOverlay.displayName = "ScreenShareOverlay";
