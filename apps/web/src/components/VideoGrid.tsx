import { useEffect, useRef } from "react";

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

export function VideoGrid({
  localStream,
  remoteStreams,
  nameFor,
}: {
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  nameFor: (pubkey: string) => string;
}) {
  const remotes = [...remoteStreams.entries()];
  if (!localStream && remotes.length === 0) return null;
  return (
    <div
      className="video-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 8,
        padding: 8,
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-elevated)",
      }}
    >
      {localStream && <VideoTile stream={localStream} label="You" muted />}
      {remotes.map(([pk, s]) => (
        <VideoTile key={pk} stream={s} label={nameFor(pk)} />
      ))}
    </div>
  );
}
