import React, { useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PinIcon, SoundboardBurst, type SoundboardChip } from "@wavvon/ui";

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
  selfPubkey: string;
  soundboardChips?: SoundboardChip[];
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
  chips,
  onPin,
  onUnpin,
}: {
  tile: VideoTile;
  chips?: SoundboardChip[];
  onPin: (pk: string) => void;
  onUnpin: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={`video-tile${tile.speaking ? " speaking" : ""}${tile.pinned ? " pinned" : ""}`}
    >
      <VideoElement stream={tile.stream} />
      <div className="video-tile-name">{tile.displayName || tile.pubkey.slice(0, 8)}</div>
      <button
        className="video-tile-pin"
        title={tile.pinned ? t("voice.video.unpin") : t("voice.video.pin")}
        aria-label={tile.pinned ? t("voice.video.unpin") : t("voice.video.pin")}
        aria-pressed={tile.pinned}
        onClick={() => (tile.pinned ? onUnpin() : onPin(tile.pubkey))}
      >
        <PinIcon size={14} />
      </button>
      <SoundboardBurst chips={chips} pubkey={tile.pubkey} />
    </div>
  );
}

export function VideoGrid({ tiles, selfStream, selfName, selfPubkey, soundboardChips, onPin, onUnpin }: Props) {
  const { t } = useTranslation();
  const [pipLeft, setPipLeft] = useState<number | null>(null);
  const [pipTop, setPipTop] = useState<number | null>(null);
  const [pipWidth, setPipWidth] = useState(120);

  useEffect(() => {
    if (pipLeft === null && selfStream) {
      setPipLeft(window.innerWidth - 132);
      setPipTop(window.innerHeight - 186);
    }
  }, [pipLeft, selfStream]);

  function startDrag(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).classList.contains("video-self-resize-handle")) return;
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const sl = pipLeft ?? window.innerWidth - 132;
    const st = pipTop ?? window.innerHeight - 186;
    function onMove(ev: MouseEvent) {
      setPipLeft(Math.max(0, Math.min(window.innerWidth - pipWidth, sl + ev.clientX - sx)));
      setPipTop(Math.max(0, Math.min(window.innerHeight - 60, st + ev.clientY - sy)));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function startResize(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sw = pipWidth;
    function onMove(ev: MouseEvent) {
      setPipWidth(Math.max(80, Math.min(400, sw + ev.clientX - sx)));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  if (tiles.length === 0 && !selfStream) return null;

  const count = tiles.length;
  const gridClass = count <= 1 ? "video-grid-1" : count <= 4 ? "video-grid-4" : "video-grid-speaker";

  return (
    <div className={`video-grid ${gridClass}`}>
      {count > 4 ? (
        <>
          {tiles[0] && (
            <div className="video-grid-main">
              <Tile tile={tiles[0]} chips={soundboardChips} onPin={onPin} onUnpin={onUnpin} />
            </div>
          )}
          <div className="video-grid-thumbnails">
            {tiles.slice(1).map((tile) => (
              <Tile key={tile.pubkey} tile={tile} chips={soundboardChips} onPin={onPin} onUnpin={onUnpin} />
            ))}
          </div>
        </>
      ) : (
        tiles.map((tile) => <Tile key={tile.pubkey} tile={tile} chips={soundboardChips} onPin={onPin} onUnpin={onUnpin} />)
      )}
      {selfStream && (
        <div
          className="video-self-view"
          style={{
            left: pipLeft ?? undefined,
            top: pipTop ?? undefined,
            right: pipLeft === null ? 12 : undefined,
            bottom: pipTop === null ? 80 : undefined,
            width: pipWidth,
          }}
          onMouseDown={startDrag}
        >
          <VideoElement stream={selfStream} muted />
          <div className="video-tile-name">{t("voice.video.self_label", { name: selfName })}</div>
          <SoundboardBurst chips={soundboardChips} pubkey={selfPubkey} />
          <div className="video-self-resize-handle" onMouseDown={startResize} />
        </div>
      )}
    </div>
  );
}
