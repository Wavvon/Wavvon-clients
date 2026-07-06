import React, { useEffect, useRef, useState } from "react";

function VideoTile({ stream, label, muted }: { stream: MediaStream; label: string; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="video-tile" style={{ position: "relative", background: "#000", borderRadius: 6, overflow: "hidden", aspectRatio: "16 / 9" }}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <span style={{ position: "absolute", left: 6, bottom: 4, fontSize: "var(--text-xs)", background: "rgba(0,0,0,.5)", color: "#fff", padding: "1px 6px", borderRadius: 4 }}>
        {label}
      </span>
    </div>
  );
}

const POS_KEY = "wavvon.videoPip.pos";
const SIZE_KEY = "wavvon.videoPip.size";

function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Floating picture-in-picture camera window. Follows the user's voice
 * session (not the selected channel): rendered at App level so it stays
 * visible while browsing other channels or hubs. Drag by the title bar;
 * resize from the bottom-right corner (native CSS resize handle).
 */
export function VideoPipWindow({
  title,
  localStream,
  remoteStreams,
  nameFor,
}: {
  title: string;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  nameFor: (pubkey: string) => string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => loadJson(POS_KEY));
  const [size] = useState<{ w: number; h: number }>(() => loadJson(SIZE_KEY) ?? { w: 320, h: 260 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Persist the size the user dragged the native resize handle to.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      try {
        localStorage.setItem(SIZE_KEY, JSON.stringify({ w: el.offsetWidth, h: el.offsetHeight }));
      } catch { /* ignore */ }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  function clamp(x: number, y: number) {
    const el = boxRef.current;
    const w = el?.offsetWidth ?? 320;
    const h = el?.offsetHeight ?? 260;
    return {
      x: Math.min(Math.max(0, x), Math.max(0, window.innerWidth - w)),
      y: Math.min(Math.max(0, y), Math.max(0, window.innerHeight - h)),
    };
  }

  function onDragStart(e: React.PointerEvent) {
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onDragMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    setPos(clamp(d.origX + (e.clientX - d.startX), d.origY + (e.clientY - d.startY)));
  }

  function onDragEnd() {
    if (!dragRef.current) return;
    dragRef.current = null;
    setPos((p) => {
      if (p) {
        try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
      }
      return p;
    });
  }

  const remotes = [...remoteStreams.entries()];
  if (!localStream && remotes.length === 0) return null;

  const placement: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { right: 16, bottom: 88 };

  return (
    <div
      ref={boxRef}
      className="video-pip"
      style={{ ...placement, width: size.w, height: size.h }}
      role="dialog"
      aria-label={title}
    >
      <div
        className="video-pip-header"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <span className="video-pip-title">📷 {title}</span>
      </div>
      <div className="video-pip-body">
        {localStream && <VideoTile stream={localStream} label="You" muted />}
        {remotes.map(([pk, s]) => (
          <VideoTile key={pk} stream={s} label={nameFor(pk)} />
        ))}
      </div>
    </div>
  );
}
