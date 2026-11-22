import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { VoiceParticipant } from "../../types";
import { Avatar } from "../Avatar";
import { adoptPageStyles, documentPictureInPicture, type CapturableVideo } from "../../utils/documentPip";

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

function RoomPipView({ people, cameras, avatars, publicKey, livesKey }: {
  people: VoiceParticipant[];
  cameras?: Map<string, MediaStream>;
  avatars: Map<string, string | null>;
  publicKey?: string | null;
  livesKey: string;
}) {
  const lives = useCapturedLives(livesKey);
  return (
    <div className="room-pip">
      {lives.map((ms, i) => (
        <div key={`live-${i}`} className="room-pip-live"><StreamVideo stream={ms} /></div>
      ))}
      <ul className="voice-tiles room-pip-people">
        {people.map((p) => {
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
        })}
      </ul>
    </div>
  );
}

/**
 * Pops the room out into a Document Picture-in-Picture window: an
 * always-on-top OS window that can sit over a game. It is a read-only copy of
 * the stage as arranged here, or of everyone when there is no stage
 * (decisions.md, "Free layout on the voice stage, mirrored by a
 * picture-in-picture window"). Only on request; where the browser lacks the
 * API the button stays, disabled, and says why.
 */
export function PopOutRoom(props: {
  people: VoiceParticipant[];
  cameras?: Map<string, MediaStream>;
  avatars: Map<string, string | null>;
  publicKey?: string | null;
  livesKey: string;
}) {
  const { t } = useTranslation();
  const docPip = documentPictureInPicture();
  const [win, setWin] = useState<Window | null>(null);

  useEffect(() => () => { win?.close(); }, [win]);

  async function toggle() {
    if (win) {
      win.close();
      return;
    }
    if (!docPip) return;
    let next: Window;
    try {
      next = await docPip.requestWindow({ width: 420, height: 300 });
    } catch {
      return;
    }
    adoptPageStyles(next);
    next.addEventListener("pagehide", () => setWin(null), { once: true });
    setWin(next);
  }

  const label = !docPip
    ? t("voice.stage.pop_out_unsupported")
    : win ? t("voice.stage.pop_in") : t("voice.stage.pop_out");
  return (
    <>
      <button
        type="button"
        className="btn-icon-header"
        disabled={!docPip}
        aria-pressed={!!win}
        title={label}
        aria-label={label}
        onClick={() => void toggle()}
      >
        ⧉
      </button>
      {win && createPortal(<RoomPipView {...props} />, win.document.body)}
    </>
  );
}
