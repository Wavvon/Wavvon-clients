import React, { forwardRef, useRef, useState } from "react";
import { ScreenShareViewer } from "./ScreenShareViewer";
import type { ScreenShareViewerRef } from "./ScreenShareViewer";
import type { ActiveStream } from "../types";

interface Props {
  streams: ActiveStream[];
  mediaOutputDeviceId?: string;
}

export const ScreenShareOverlay = forwardRef<ScreenShareViewerRef, Props>(
  ({ streams, mediaOutputDeviceId }, ref) => {
    const [pos, setPos] = useState(() => ({
      x: window.innerWidth - 500 - 16,
      y: window.innerHeight - 310 - 16,
    }));
    const [size, setSize] = useState({ w: 500, h: 310 });
    const [minimized, setMinimized] = useState(false);

    const dragOffset = useRef({ x: 0, y: 0 });
    const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

    const sharerMap = new Map<string, boolean>();
    for (const s of streams) sharerMap.set(s.sharer_pubkey, true);
    const sharers = [...sharerMap.keys()];

    if (streams.length === 0) return null;

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
          <span className="ss-overlay__title">Screen sharing</span>
          <div className="ss-overlay__spacer" />
          {sharers.length > 1 && (
            <span className="ss-overlay__badge">{sharers.length} streams</span>
          )}
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
            ref={ref}
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
);

ScreenShareOverlay.displayName = "ScreenShareOverlay";
