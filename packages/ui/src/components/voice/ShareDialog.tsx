import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FocusTrap } from "../FocusTrap";
import { CloseIcon } from "../Icons";

/** A hub's caps on a declared stream (`/info.stream_limits`); absent = no cap. */
export interface StreamLimits {
  max_width?: number;
  max_height?: number;
  max_fps?: number;
  max_kbps?: number;
}

/** What the sharer chose. No width/height means the screen's own size. */
export interface ShareQuality {
  width?: number;
  height?: number;
  fps: number;
  kbps: number;
  audio: boolean;
  /** Who may watch, on hubs with `screenshare.audience`: the voice room
   *  only, or anyone in the hub. Absent on older hubs (the whole hub). */
  audience?: "room" | "hub";
}

const RESOLUTIONS = [
  { label: "720p", width: 1280, height: 720 },
  { label: "1080p", width: 1920, height: 1080 },
  { label: "1440p", width: 2560, height: 1440 },
  { label: "4K", width: 3840, height: 2160 },
  { label: "native", width: undefined, height: undefined },
] as const;
const FRAME_RATES = [15, 30, 60, 120, 144];

// ponytail: a flat bits-per-pixel guess (1080p30 is about 2.5 Mbps); the
// encoder spends less on a still screen, which the live readout shows.
const BITS_PER_PIXEL = 0.04;

function nativeSize(): { width: number; height: number } {
  const dpr = window.devicePixelRatio || 1;
  return { width: Math.round(window.screen.width * dpr), height: Math.round(window.screen.height * dpr) };
}

export function estimateKbps(width: number, height: number, fps: number, limits?: StreamLimits): number {
  const kbps = Math.round((width * height * fps * BITS_PER_PIXEL) / 1000);
  return limits?.max_kbps ? Math.min(kbps, limits.max_kbps) : kbps;
}

/** `getDisplayMedia` video constraints for a choice: it never exceeds it. */
export function shareVideoConstraints(q: ShareQuality): MediaTrackConstraints {
  const size = q.width && q.height ? { width: { max: q.width }, height: { max: q.height } } : {};
  return { frameRate: { ideal: q.fps, max: q.fps }, ...size };
}

/** MediaRecorder options for a share. A viewer who opens a live late gets the
 *  first chunk (the only keyframe a recorder writes by default) and then
 *  chunks from much later, which cannot decode without the frames between:
 *  a keyframe every couple of seconds is what lets them join. */
export function shareRecorderOptions(mimeType: string, bitsPerSecond: number): MediaRecorderOptions {
  return { mimeType, videoBitsPerSecond: bitsPerSecond, videoKeyFrameIntervalDuration: 2000 } as MediaRecorderOptions;
}

/** The fields `screen_share_start` declares, read back from the captured track. */
export function declaredQuality(q: ShareQuality, track: MediaStreamTrack | undefined) {
  const s = track?.getSettings();
  return {
    width: q.width ?? s?.width,
    height: q.height ?? s?.height,
    fps: q.fps,
    kbps: q.kbps,
    ...(q.audience ? { audience: q.audience } : {}),
  };
}

interface Props {
  /** Resolves the hub's caps; undefined when it advertises none. */
  loadLimits: () => Promise<StreamLimits | undefined>;
  onStart: (quality: ShareQuality) => void;
  onCancel: () => void;
  /** The hub takes an audience (`screenshare.audience`): offer the choice. */
  audienceChoice?: boolean;
  /** Extra options a client adds (desktop: the webcam). */
  children?: React.ReactNode;
}

/**
 * The share dialog: resolution, frame rate, audio and the upload it costs.
 * The source itself is chosen in the browser's or the system's picker that
 * follows; neither lets a page preselect one.
 */
export function ShareDialog({ loadLimits, onStart, onCancel, audienceChoice, children }: Props) {
  const { t } = useTranslation();
  const [limits, setLimits] = useState<StreamLimits | undefined>();
  const [res, setRes] = useState(1);
  const [fps, setFps] = useState(30);
  const [audio, setAudio] = useState(false);
  const [audience, setAudience] = useState<"room" | "hub">("room");

  const resAllowed = (i: number) => {
    const r = RESOLUTIONS[i];
    if (!r.width) return !limits?.max_width && !limits?.max_height;
    return (!limits?.max_width || r.width <= limits.max_width) && (!limits?.max_height || r.height <= limits.max_height);
  };
  const fpsAllowed = (f: number) => !limits?.max_fps || f <= limits.max_fps;

  useEffect(() => {
    let live = true;
    loadLimits().then((l) => { if (live) setLimits(l); }).catch(() => { /* no caps known */ });
    return () => { live = false; };
  }, [loadLimits]);

  // A cap that arrives after the defaults were set pulls them down to it.
  useEffect(() => {
    if (!resAllowed(res)) {
      const best = [1, 0].find(resAllowed);
      setRes(best ?? -1);
    }
    if (!fpsAllowed(fps)) setFps([...FRAME_RATES].reverse().find(fpsAllowed) ?? -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limits]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const chosen = RESOLUTIONS[res];
  const size = chosen?.width ? { width: chosen.width, height: chosen.height } : nativeSize();
  const kbps = useMemo(() => estimateKbps(size.width, size.height, fps, limits), [size.width, size.height, fps, limits]);
  const ready = res >= 0 && fps > 0;
  const resLabel = (label: string) => (label === "native" ? t("voice.screen_share.picker.native") : label);

  function share() {
    if (!ready) return;
    onStart({ width: chosen.width, height: chosen.height, fps, kbps, audio, ...(audienceChoice ? { audience } : {}) });
  }

  return (
    <div className="screen-share-picker-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <FocusTrap>
        <div className="screen-share-picker" role="dialog" aria-modal="true" aria-labelledby="screen-share-title">
          <div className="share-head">
            <h2 id="screen-share-title">{t("voice.screen_share.picker.title")}</h2>
            <button type="button" className="btn-icon-header share-close" aria-label={t("modal.close")} title={t("modal.close")} onClick={onCancel}>
              <CloseIcon size={18} />
            </button>
          </div>

          <div className="share-body">
            <span className="share-section-label">{t("voice.screen_share.picker.quality")}</span>
            <div className="share-choice">
              <span className="share-choice-label" id="share-res-label">{t("voice.screen_share.picker.resolution")}</span>
              <div className="share-choice-options" role="radiogroup" aria-labelledby="share-res-label">
                {RESOLUTIONS.map((r, i) => (
                  <button
                    key={r.label}
                    type="button"
                    role="radio"
                    className="share-option"
                    aria-checked={res === i}
                    aria-disabled={!resAllowed(i)}
                    title={resAllowed(i) ? undefined : t("voice.screen_share.picker.hub_limit")}
                    onClick={() => { if (resAllowed(i)) setRes(i); }}
                  >
                    {resLabel(r.label)}
                  </button>
                ))}
              </div>
            </div>

            <div className="share-choice">
              <span className="share-choice-label" id="share-fps-label">{t("voice.screen_share.picker.frame_rate")}</span>
              <div className="share-choice-options" role="radiogroup" aria-labelledby="share-fps-label">
                {FRAME_RATES.map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    className="share-option"
                    aria-checked={fps === f}
                    aria-disabled={!fpsAllowed(f)}
                    title={fpsAllowed(f) ? undefined : t("voice.screen_share.picker.hub_limit")}
                    onClick={() => { if (fpsAllowed(f)) setFps(f); }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {ready && (
              <p className="share-note">
                <InfoGlyph />
                {t("voice.screen_share.picker.bitrate_note", { mbps: (kbps / 1000).toFixed(1) })}
              </p>
            )}

            <label className="share-audio">
              <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} />
              {t("voice.screen_share.picker.include_audio")}
            </label>
            {audio && <p className="screen-share-macos-notice">{t("voice.screen_share.picker.macos_notice")}</p>}
            {audienceChoice && (
              <fieldset className="share-audience">
                <legend className="share-section-label">{t("voice.screen_share.picker.audience")}</legend>
                <label>
                  <input type="radio" name="share-audience" checked={audience === "room"} onChange={() => setAudience("room")} />
                  {t("voice.screen_share.picker.audience_room")}
                </label>
                <label>
                  <input type="radio" name="share-audience" checked={audience === "hub"} onChange={() => setAudience("hub")} />
                  {t("voice.screen_share.picker.audience_hub")}
                </label>
              </fieldset>
            )}
            {children}
          </div>

          <div className="share-foot">
            {ready && (
              <span className="share-summary">
                {t("voice.screen_share.picker.footer", { resolution: resLabel(chosen.label), fps })}
                {" · "}
                {t(audio ? "voice.screen_share.picker.with_audio" : "voice.screen_share.picker.without_audio")}
              </span>
            )}
            <button type="button" className="share-cancel" onClick={onCancel}>{t("modal.cancel")}</button>
            <button type="button" className="share-go" onClick={share} disabled={!ready}>
              {t("voice.screen_share.picker.share_button")}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}

function InfoGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" />
    </svg>
  );
}
