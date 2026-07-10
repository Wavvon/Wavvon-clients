import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BackgroundProcessor, type BackgroundMode } from "../utils/backgroundProcessor";

// Camera background effects + a live preview (Settings → Voice), mirroring
// web's CameraTab. Mode/source state lives in useVideo (persisted to
// localStorage there); changing them here live-applies to the in-call
// camera through onChangeBackground. The preview runs its own capture so
// it works outside a call, honoring the device picked in the row above.
interface CameraSectionProps {
  backgroundMode: BackgroundMode;
  backgroundSource: string | null;
  backgroundActive: boolean | null;
  onChangeBackground: (mode: BackgroundMode, source?: string | null) => void;
  videoInputDevice: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function CameraSection(props: CameraSectionProps) {
  const { t } = useTranslation();
  const [previewing, setPreviewing] = useState(false);
  // null = no effect requested; true/false = effect requested and running/fell back.
  const [previewBgActive, setPreviewBgActive] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rawRef = useRef<MediaStream | null>(null);
  const procRef = useRef<BackgroundProcessor | null>(null);

  function stopPreview() {
    procRef.current?.stop();
    procRef.current = null;
    rawRef.current?.getTracks().forEach((tr) => tr.stop());
    rawRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPreviewing(false);
    setPreviewBgActive(null);
  }

  async function startPreview(devId: string, m: BackgroundMode, src: string | null) {
    setError(null);
    stopPreview();
    try {
      const raw = await navigator.mediaDevices.getUserMedia({
        video: devId ? { deviceId: { exact: devId } } : true,
        audio: false,
      });
      rawRef.current = raw;
      let out = raw;
      if (m !== "none") {
        const proc = new BackgroundProcessor(raw);
        out = await proc.start(m, src);
        procRef.current = proc;
        // The processor falls back to raw video when segmentation can't
        // load — tell the user instead of pretending the effect is on.
        setPreviewBgActive(proc.activeMode !== "none");
      } else {
        setPreviewBgActive(null);
      }
      if (videoRef.current) {
        videoRef.current.srcObject = out;
        await videoRef.current.play().catch(() => {});
      }
      setPreviewing(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Mode/source/device changes flow through props (state lives in useVideo);
  // restart the running preview so it reflects them.
  useEffect(() => {
    if (previewing) void startPreview(props.videoInputDevice, props.backgroundMode, props.backgroundSource);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.videoInputDevice, props.backgroundMode, props.backgroundSource]);

  useEffect(() => stopPreview, []);

  async function onBackgroundFile(kind: "image" | "video", file?: File) {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      props.onChangeBackground(kind, dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const mode = props.backgroundMode;
  // While previewing, report the preview pipeline; otherwise the live call's.
  const statusActive = previewing ? previewBgActive : props.backgroundActive;

  return (
    <div className="settings-section">
      <label className="settings-label" htmlFor="settings-camera-bg">{t("settings.camera.background_label")}</label>
      <select
        id="settings-camera-bg"
        aria-label={t("settings.camera.background_aria")}
        value={mode}
        onChange={(e) => {
          const m = e.target.value as BackgroundMode;
          // Keep the existing source when switching to image/video; clear otherwise.
          props.onChangeBackground(m, m === "image" || m === "video" ? props.backgroundSource : null);
        }}
      >
        <option value="none">{t("settings.camera.bg.none")}</option>
        <option value="blur">{t("settings.camera.bg.blur")}</option>
        <option value="image">{t("settings.camera.bg.image")}</option>
        <option value="video">{t("settings.camera.bg.video")}</option>
      </select>
      {mode === "image" && (
        <input
          type="file"
          accept="image/*"
          aria-label={t("settings.camera.bg.image_file_aria")}
          onChange={(e) => { void onBackgroundFile("image", e.target.files?.[0]); e.target.value = ""; }}
          style={{ marginTop: "var(--space-2)" }}
        />
      )}
      {mode === "video" && (
        <input
          type="file"
          accept="video/*"
          aria-label={t("settings.camera.bg.video_file_aria")}
          onChange={(e) => { void onBackgroundFile("video", e.target.files?.[0]); e.target.value = ""; }}
          style={{ marginTop: "var(--space-2)" }}
        />
      )}
      {(mode === "image" || mode === "video") && !props.backgroundSource && (
        <p className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-1)" }}>
          {t(mode === "image" ? "settings.camera.bg.pick_hint_image" : "settings.camera.bg.pick_hint_video")}
        </p>
      )}

      <div style={{ marginTop: "var(--space-2)", display: "flex", gap: "var(--space-2)" }}>
        {previewing ? (
          <button className="btn-secondary" onClick={stopPreview}>{t("settings.camera.preview.stop")}</button>
        ) : (
          <button className="btn-secondary" onClick={() => startPreview(props.videoInputDevice, mode, props.backgroundSource)}>
            {t("settings.camera.preview.start")}
          </button>
        )}
      </div>
      {statusActive !== null && (
        <p className="muted" aria-live="polite" style={{ fontSize: "var(--text-xs)", marginTop: 6, marginBottom: 0 }}>
          {t(statusActive ? "settings.camera.bg.status_active" : "settings.camera.bg.status_unavailable")}
        </p>
      )}

      <video
        ref={videoRef}
        muted
        playsInline
        style={{
          display: previewing ? "block" : "none",
          marginTop: "var(--space-2)",
          width: "100%",
          maxWidth: 320,
          borderRadius: "var(--r-md)",
          background: "#000",
          transform: "scaleX(-1)",
        }}
      />
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
