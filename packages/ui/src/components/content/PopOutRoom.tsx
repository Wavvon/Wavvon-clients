import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { VoiceParticipant } from "../../types";
import { Avatar } from "../Avatar";
import { adoptPageStyles, documentPictureInPicture, type CapturableVideo } from "../../utils/documentPip";
import { LIVES_ITEM, SELF_SHARE_ITEM, type FreeLayout } from "../../utils/freeLayout";

interface RoomPipProps {
  people: VoiceParticipant[];
  cameras?: Map<string, MediaStream>;
  avatars: Map<string, string | null>;
  publicKey?: string | null;
  livesKey: string;
  /** Your own share as you capture it: the page never plays it as a live, so
   *  it is not among the captured players. */
  selfShare?: MediaStream;
  /** The stage in free layout, mirrored as arranged; absent for the grid. */
  free?: FreeLayout;
}

function StreamVideo({ stream, mirrored }: { stream: MediaStream; mirrored?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} className={`voice-tile-camera${mirrored ? " mirrored" : ""}`} autoPlay muted playsInline />;
}

/** The lives open in the room, captured from their players on the page: a
 *  MediaSource feeds one element only, so the window shows copies. */
function useCapturedLives(key: string): MediaStream[] {
  const [streams, setStreams] = useState<MediaStream[]>([]);
  useEffect(() => {
    const captured: MediaStream[] = [];
    for (const el of document.querySelectorAll<HTMLVideoElement>(".voice-room .screen-share-panel video.main-stream")) {
      const v = el as CapturableVideo;
      const ms = v.captureStream?.() ?? v.mozCaptureStream?.();
      if (ms) captured.push(ms);
    }
    setStreams(captured);
    return () => captured.forEach((ms) => ms.getTracks().forEach((tr) => tr.stop()));
  }, [key]);
  return streams;
}

type TileSource = Pick<RoomPipProps, "cameras" | "avatars" | "publicKey">;

function personTile(p: VoiceParticipant, { cameras, avatars, publicKey }: TileSource) {
  const name = p.display_name || p.public_key.slice(0, 12);
  const camera = cameras?.get(p.public_key);
  return (
    <li key={p.public_key} className={`voice-tile${camera ? " has-camera" : ""}`}>
      {camera
        ? <StreamVideo stream={camera} mirrored={p.public_key === publicKey} />
        : <Avatar src={avatars.get(p.public_key)} name={name} pubkey={p.public_key} size={48} />}
      <span className="voice-tile-name">{name}</span>
    </li>
  );
}

function RoomPipView({ people, cameras, avatars, publicKey, livesKey, selfShare, free }: RoomPipProps) {
  const lives = useCapturedLives(livesKey);
  // The stage in free layout: the same rectangles and layer order, scaled to
  // the window.
  if (free) {
    const liveRect = free.rects[LIVES_ITEM];
    const selfRect = free.rects[SELF_SHARE_ITEM];
    return (
      <div className="room-pip room-pip--free">
        {selfRect && selfShare && (
          <div className="free-item" style={{ left: `${selfRect.x}%`, top: `${selfRect.y}%`, width: `${selfRect.w}%`, height: `${selfRect.h}%`, zIndex: free.top === "lives" ? 2 : 1 }}>
            <div className="room-pip-live"><StreamVideo stream={selfShare} /></div>
          </div>
        )}
        {liveRect && lives.length > 0 && (
          <div className="free-item" style={{ left: `${liveRect.x}%`, top: `${liveRect.y}%`, width: `${liveRect.w}%`, height: `${liveRect.h}%`, zIndex: free.top === "lives" ? 2 : 1 }}>
            <div className="room-pip-live">{lives.map((ms, i) => <StreamVideo key={i} stream={ms} />)}</div>
          </div>
        )}
        {people.map((p) => {
          const r = free.rects[p.public_key];
          if (!r) return null;
          return (
            <div key={p.public_key} className="free-item" style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`, zIndex: free.top === "people" ? 2 : 1 }}>
              <ul className="voice-tiles free-tile">{personTile(p, { cameras, avatars, publicKey })}</ul>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="room-pip">
      {lives.map((ms, i) => (
        <div key={`live-${i}`} className="room-pip-live"><StreamVideo stream={ms} /></div>
      ))}
      {selfShare && <div className="room-pip-live"><StreamVideo stream={selfShare} /></div>}
      <ul className="voice-tiles room-pip-people">
        {people.map((p) => personTile(p, { cameras, avatars, publicKey }))}
      </ul>
    </div>
  );
}

/**
 * Pops the room out into a Document Picture-in-Picture window: an
 * always-on-top OS window that can sit over a game. It is a read-only copy of
 * the stage as arranged here, or of everyone when there is no stage
 * (decisions.md, "Free layout on the voice stage, mirrored by a
 * picture-in-picture window"). Only on request. Where the browser lacks the
 * API (Firefox, Safari) it opens an ordinary small window instead: the same
 * copy, which the OS does not keep on top.
 */
export function PopOutRoom(props: RoomPipProps) {
  const { t } = useTranslation();
  const docPip = documentPictureInPicture();
  const [win, setWin] = useState<Window | null>(null);

  useEffect(() => () => { win?.close(); }, [win]);

  async function toggle() {
    if (win) {
      win.close();
      return;
    }
    let next: Window | null;
    try {
      next = docPip
        ? await docPip.requestWindow({ width: 420, height: 300 })
        : window.open("", "wavvon-room", "popup,width=420,height=300");
    } catch {
      return;
    }
    if (!next) return;
    if (!docPip) next.document.title = t("voice.stage.pop_out");
    adoptPageStyles(next);
    next.addEventListener("pagehide", () => setWin(null), { once: true });
    setWin(next);
  }

  const label = win ? t("voice.stage.pop_in") : t("voice.stage.pop_out");
  return (
    <>
      <button
        type="button"
        className={`btn-icon-gear${win ? " on" : ""}`}
        aria-pressed={!!win}
        title={label}
        aria-label={label}
        onClick={() => void toggle()}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
          <rect x="12" y="13" width="10" height="7" rx="2" />
        </svg>
      </button>
      {win && createPortal(<RoomPipView {...props} />, win.document.body)}
    </>
  );
}
