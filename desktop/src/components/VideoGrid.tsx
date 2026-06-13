import React, { useRef, useEffect } from "react";

interface VideoTile {
  pubkey: string;
  displayName: string;
  stream: MediaStream;
  speaking: boolean;
  pinned: boolean;
}

interface Props {
  tiles: VideoTile[];
  selfStream: MediaStream | null;
  selfName: string;
  onPin: (pubkey: string) => void;
  onUnpin: () => void;
}

function VideoElement({ stream, muted = false }: { stream: MediaStream; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className="video-tile-video" />;
}

function Tile({
  tile,
  onPin,
  onUnpin,
}: {
  tile: VideoTile;
  onPin: (pk: string) => void;
  onUnpin: () => void;
}) {
  return (
    <div
      className={`video-tile${tile.speaking ? " speaking" : ""}${tile.pinned ? " pinned" : ""}`}
    >
      <VideoElement stream={tile.stream} />
      <div className="video-tile-name">{tile.displayName || tile.pubkey.slice(0, 8)}</div>
      <button
        className="video-tile-pin"
        title={tile.pinned ? "Unpin" : "Pin"}
        onClick={() => (tile.pinned ? onUnpin() : onPin(tile.pubkey))}
      >
        {tile.pinned ? "📌" : "📍"}
      </button>
    </div>
  );
}

export function VideoGrid({ tiles, selfStream, selfName, onPin, onUnpin }: Props) {
  if (tiles.length === 0 && !selfStream) return null;

  const count = tiles.length;
  const gridClass = count <= 1 ? "video-grid-1" : count <= 4 ? "video-grid-4" : "video-grid-speaker";

  return (
    <div className={`video-grid ${gridClass}`}>
      {count > 4 ? (
        <>
          {tiles[0] && (
            <div className="video-grid-main">
              <Tile tile={tiles[0]} onPin={onPin} onUnpin={onUnpin} />
            </div>
          )}
          <div className="video-grid-thumbnails">
            {tiles.slice(1).map(t => (
              <Tile key={t.pubkey} tile={t} onPin={onPin} onUnpin={onUnpin} />
            ))}
          </div>
        </>
      ) : (
        tiles.map(t => <Tile key={t.pubkey} tile={t} onPin={onPin} onUnpin={onUnpin} />)
      )}
      {selfStream && (
        <div className="video-self-view">
          <VideoElement stream={selfStream} muted />
          <div className="video-tile-name">{selfName} (you)</div>
        </div>
      )}
    </div>
  );
}
