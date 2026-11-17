import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatClock, waveformPeaks } from "../utils/voiceMessage";

const BARS = 48;
const SPEEDS = [1, 1.5, 2] as const;

/** Inline player for a voice message: play/pause, a waveform that doubles as
 *  the seek bar, the time, and playback speed. */
export function VoiceMessagePlayer({ url, name }: { url: string; name: string }) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  // A MediaRecorder WebM carries no duration in its header, so the element
  // reports Infinity; the decoded buffer knows.
  const [duration, setDuration] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => new OfflineAudioContext(1, 1, 48_000).decodeAudioData(buf))
      .then((audio) => {
        if (cancelled) return;
        setPeaks(waveformPeaks(audio.getChannelData(0), BARS));
        setDuration(audio.duration);
      })
      .catch(() => { /* no waveform: the bars stay flat and the element still plays */ });
    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = speed; }, [speed]);

  const total = duration ?? 0;
  const progress = total > 0 ? Math.min(1, current / total) : 0;

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => setPlaying(false));
    else a.pause();
  }

  function seek(fraction: number) {
    const a = audioRef.current;
    if (!a || total <= 0) return;
    a.currentTime = fraction * total;
    setCurrent(a.currentTime);
  }

  return (
    <div className="voice-message" role="group" aria-label={t("voice_message.label", { name })}>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrent(0); }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setDuration((d) => d ?? e.currentTarget.duration);
          e.currentTarget.playbackRate = speed;
        }}
      />
      <button
        type="button"
        className="voice-message-play"
        onClick={toggle}
        aria-label={playing ? t("voice_message.pause") : t("voice_message.play")}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div
        className="voice-message-wave"
        role="slider"
        tabIndex={0}
        aria-label={t("voice_message.seek")}
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(current)}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          seek((e.clientX - r.left) / r.width);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") seek(Math.min(1, progress + 0.05));
          if (e.key === "ArrowLeft") seek(Math.max(0, progress - 0.05));
        }}
      >
        {(peaks ?? new Array<number>(BARS).fill(0)).map((p, i) => (
          <span
            key={i}
            className={`voice-message-bar${i / BARS < progress ? " played" : ""}`}
            style={{ height: `${Math.max(8, p * 100)}%` }}
          />
        ))}
      </div>
      <span className="voice-message-time">
        {formatClock(playing || current > 0 ? current : total)}
      </span>
      <button
        type="button"
        className="voice-message-speed"
        onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}
        aria-label={t("voice_message.speed", { speed })}
      >
        {speed}×
      </button>
    </div>
  );
}
