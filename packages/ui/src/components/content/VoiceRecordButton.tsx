import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MicOnIcon } from "../Icons";
import {
  VOICE_BITS_PER_SECOND, VOICE_MAX_MS, VOICE_MIN_MS, formatClock, pickVoiceMime, voiceFileName,
} from "../../utils/voiceMessage";

/** How far the pointer has to slide off the button to arm a cancel. */
const CANCEL_DISTANCE = 80;

interface Recording {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  startedAt: number;
  mime: string;
  cancel: boolean;
}

/** Hold to record, release to send, slide away to cancel. Space or Enter held
 *  on the focused button does the same from the keyboard. */
export function VoiceRecordButton({ onSend, onError }: {
  onSend: (file: File) => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const rec = useRef<Recording | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  // A release can arrive while getUserMedia is still asking for permission.
  const released = useRef(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [cancelArmed, setCancelArmed] = useState(false);

  useEffect(() => {
    if (elapsed === null) return;
    const timer = setInterval(() => {
      const r = rec.current;
      if (!r) return;
      const ms = Date.now() - r.startedAt;
      setElapsed(ms);
      if (ms >= VOICE_MAX_MS) finish(false);
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed === null]);

  useEffect(() => () => { rec.current?.stream.getTracks().forEach((tr) => tr.stop()); }, []);

  async function start() {
    if (rec.current) return;
    released.current = false;
    const mime = typeof MediaRecorder !== "undefined" ? pickVoiceMime((m) => MediaRecorder.isTypeSupported(m)) : null;
    if (!mime || !navigator.mediaDevices?.getUserMedia) {
      onError(t("voice_message.unsupported"));
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError(t("voice_message.no_mic"));
      return;
    }
    if (released.current) {
      // Let go while the permission prompt was up: that was the first-use
      // grant, not a recording.
      stream.getTracks().forEach((tr) => tr.stop());
      return;
    }
    const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: VOICE_BITS_PER_SECOND });
    const r: Recording = { recorder, stream, chunks: [], startedAt: Date.now(), mime, cancel: false };
    recorder.ondataavailable = (e) => { if (e.data.size > 0) r.chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      const duration = Date.now() - r.startedAt;
      if (r.cancel) return;
      if (duration < VOICE_MIN_MS) { onError(t("voice_message.too_short")); return; }
      const file = new File(r.chunks, voiceFileName(mime), { type: mime.split(";")[0] });
      void Promise.resolve(onSend(file)).catch((e) => onError(String(e)));
    };
    recorder.start(1000);
    rec.current = r;
    setCancelArmed(false);
    setElapsed(0);
  }

  function finish(cancel: boolean) {
    released.current = true;
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    r.cancel = cancel;
    if (r.recorder.state !== "inactive") r.recorder.stop();
    setElapsed(null);
    setCancelArmed(false);
  }

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    origin.current = { x: e.clientX, y: e.clientY };
    void start();
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const o = origin.current;
    if (!o || !rec.current) return;
    setCancelArmed(Math.hypot(e.clientX - o.x, e.clientY - o.y) > CANCEL_DISTANCE);
  }

  function onPointerUp() {
    origin.current = null;
    finish(cancelArmed);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); void start(); }
    if (e.key === "Escape" && rec.current) { e.preventDefault(); finish(true); }
  }

  function onKeyUp(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); finish(false); }
  }

  const recording = elapsed !== null;
  return (
    <>
      {recording && (
        <span className={`voice-record-status${cancelArmed ? " cancel" : ""}`} role="status">
          <span className="voice-record-dot" aria-hidden="true" />
          {formatClock(elapsed / 1000)}
          {" · "}
          {cancelArmed ? t("voice_message.release_to_cancel") : t("voice_message.slide_to_cancel")}
        </span>
      )}
      <button
        type="button"
        className={`composer-btn${recording ? " open" : ""}`}
        title={t("voice_message.hold")}
        aria-label={t("voice_message.hold")}
        aria-pressed={recording}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => finish(true)}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <MicOnIcon size={18} />
      </button>
    </>
  );
}
