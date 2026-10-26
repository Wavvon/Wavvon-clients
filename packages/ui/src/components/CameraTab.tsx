import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BackgroundProcessor,
  loadBgMode,
  loadBgSource,
  saveBg,
  type BackgroundMode,
} from "../utils/backgroundProcessor";

// Camera device selection and background effects around a live preview
// (Settings → Camera). Every choice here is visual, so the preview leads the
// page and starts with it; it stops when the tab closes so the camera light
// goes off. The chosen device is read by App when enabling the
// camera in voice (wavvon.videoInputDevice); the background effect
// (wavvon.bgMode/bgSource) is applied there too, and live via a
// "wavvon:bgchange" event.
const KEY = "wavvon.videoInputDevice";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function CameraTab() {
  const { t } = useTranslation();
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState<string>(() => localStorage.getItem(KEY) ?? "");
  const [mode, setMode] = useState<BackgroundMode>(() => loadBgMode());
  const [source, setSource] = useState<string | null>(() => loadBgSource());
  const [previewing, setPreviewing] = useState(false);
  // null = no effect requested; true/false = effect requested and running/fell back.
  const [bgActive, setBgActive] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [checked, setChecked] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rawRef = useRef<MediaStream | null>(null);
  const procRef = useRef<BackgroundProcessor | null>(null);

  function stopPreview() {
    procRef.current?.stop();
    procRef.current = null;
    rawRef.current?.getTracks().forEach((t) => t.stop());
    rawRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPreviewing(false);
    setBgActive(null);
  }

  // Labels are blank until camera permission is granted at least once.
  async function refresh(): Promise<boolean> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      setCameras(cams);
      const locked = cams.length > 0 && cams.every((d) => !d.label);
      setNeedsPermission(locked);
      return locked;
    } catch {
      setCameras([]);
      return false;
    } finally {
      setChecked(true);
    }
  }

  // Asking for the camera is the button's job, never the tab's on open: a
  // prompt the user did not ask for is the wrong first impression.
  async function grantAndPreview() {
    setNeedsPermission(false);
    await startPreview(device, mode, source);
  }

  useEffect(() => {
    void refresh().then((locked) => {
      if (!locked) void startPreview(device, mode, source);
    });
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
      stopPreview();
    };
  }, []);

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
        setBgActive(proc.activeMode !== "none");
      } else {
        setBgActive(null);
      }
      if (videoRef.current) {
        videoRef.current.srcObject = out;
        await videoRef.current.play().catch(() => {});
      }
      setPreviewing(true);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function applyMode(m: BackgroundMode, src: string | null) {
    setMode(m);
    setSource(src);
    saveBg(m, src);
    // Tell App to re-apply to the live voice camera, if on.
    window.dispatchEvent(new Event("wavvon:bgchange"));
    if (previewing) void startPreview(device, m, src);
  }

  function pickDevice(v: string) {
    setDevice(v);
    if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY);
    if (previewing) void startPreview(v, mode, source);
    // Re-run App's live camera pipeline (same event the background-effect
    // controls use) so an in-progress video call switches to the new device.
    window.dispatchEvent(new Event("wavvon:bgchange"));
  }

  async function onBackgroundFile(kind: "image" | "video", file?: File) {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      applyMode(kind, dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const MODES: BackgroundMode[] = ["none", "blur", "image", "video"];

  return (
    <section>
      <h1>{t("settings.tabs.camera")}</h1>

      <div className="camera-preview">
        <video ref={videoRef} muted playsInline style={{ visibility: previewing ? "visible" : "hidden" }} />
        {checked && needsPermission && (
          <button className="camera-preview-overlay" onClick={grantAndPreview}>
            {t("settings.camera.permission_button")}
          </button>
        )}
      </div>
      {previewing && bgActive !== null && (
        <p className="muted" aria-live="polite" style={{ fontSize: "var(--text-xs)", marginTop: 6, marginBottom: 0 }}>
          {t(bgActive ? "settings.camera.bg.status_active" : "settings.camera.bg.status_unavailable")}
        </p>
      )}
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}

      <label className="settings-label" htmlFor="camera-device" style={{ marginTop: "var(--space-4)" }}>
        {t("settings.camera.device_label")}
      </label>
      <select id="camera-device" aria-label={t("settings.camera.device_aria")} value={device} onChange={(e) => pickDevice(e.target.value)} style={{ width: "100%", maxWidth: 320 }}>
        <option value="">{t("settings.camera.system_default")}</option>
        {cameras.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || t("settings.camera.fallback_name", { num: i + 1 })}</option>)}
      </select>

      <span className="settings-label" id="camera-bg-label" style={{ marginTop: "var(--space-4)" }}>
        {t("settings.camera.background_label")}
      </span>
      <div role="radiogroup" aria-label={t("settings.camera.background_aria")} className="settings-row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
        {MODES.map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={mode === m}
            className={`discover-tag-chip${mode === m ? " active" : ""}`}
            // Keep the existing source when switching to image/video; clear otherwise.
            onClick={() => applyMode(m, m === "image" || m === "video" ? source : null)}
          >
            {t(`settings.camera.bg.${m}`)}
          </button>
        ))}
      </div>
      {mode === "image" && (
        <input type="file" accept="image/*" aria-label={t("settings.camera.bg.image_file_aria")} onChange={(e) => onBackgroundFile("image", e.target.files?.[0])} />
      )}
      {mode === "video" && (
        <input type="file" accept="video/*" aria-label={t("settings.camera.bg.video_file_aria")} onChange={(e) => onBackgroundFile("video", e.target.files?.[0])} />
      )}
      {(mode === "image" || mode === "video") && !source && (
        <p className="muted" style={{ fontSize: "var(--text-xs)" }}>{t(mode === "image" ? "settings.camera.bg.pick_hint_image" : "settings.camera.bg.pick_hint_video")}</p>
      )}
    </section>
  );
}
