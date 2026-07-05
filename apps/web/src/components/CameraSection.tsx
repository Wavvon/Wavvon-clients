import { useEffect, useRef, useState } from "react";
import {
  BackgroundProcessor,
  loadBgMode,
  loadBgSource,
  saveBg,
  type BackgroundMode,
} from "../utils/backgroundProcessor";

// Camera device selection, background effects, and a live preview
// (Settings → Voice). The chosen device is read by App when enabling the
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

export function CameraSection() {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState<string>(() => localStorage.getItem(KEY) ?? "");
  const [mode, setMode] = useState<BackgroundMode>(() => loadBgMode());
  const [source, setSource] = useState<string | null>(() => loadBgSource());
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  }

  async function refresh() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter((d) => d.kind === "videoinput"));
    } catch { setCameras([]); }
  }

  useEffect(() => {
    void refresh();
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

  return (
    <div className="settings-section" style={{ marginTop: 20 }}>
      <label className="settings-label">Camera</label>
      <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
        Choose your camera and a background effect, and preview it. Applies the next time you turn your camera on in voice.
      </p>

      <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
        <label className="settings-label" style={{ fontSize: "var(--text-sm)" }} htmlFor="camera-device">Camera</label>
        <select id="camera-device" aria-label="Camera device" value={device} onChange={(e) => pickDevice(e.target.value)} style={{ width: "100%", maxWidth: 360 }}>
          <option value="">System default</option>
          {cameras.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
        </select>
      </div>

      <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4, marginTop: "var(--space-2)" }}>
        <label className="settings-label" style={{ fontSize: "var(--text-sm)" }} htmlFor="camera-bg">Background</label>
        <select
          id="camera-bg"
          aria-label="Background effect"
          value={mode}
          onChange={(e) => {
            const m = e.target.value as BackgroundMode;
            // Keep the existing source when switching to image/video; clear otherwise.
            applyMode(m, m === "image" || m === "video" ? source : null);
          }}
          style={{ width: "100%", maxWidth: 360 }}
        >
          <option value="none">None</option>
          <option value="blur">Blur</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>
        {mode === "image" && (
          <input type="file" accept="image/*" aria-label="Background image" onChange={(e) => onBackgroundFile("image", e.target.files?.[0])} />
        )}
        {mode === "video" && (
          <input type="file" accept="video/*" aria-label="Background video" onChange={(e) => onBackgroundFile("video", e.target.files?.[0])} />
        )}
        {(mode === "image" || mode === "video") && !source && (
          <span className="muted" style={{ fontSize: "var(--text-xs)" }}>Pick a {mode} above (until then the background is blurred).</span>
        )}
      </div>

      <div style={{ marginTop: "var(--space-2)", display: "flex", gap: "var(--space-2)" }}>
        {previewing ? (
          <button className="btn-secondary" onClick={stopPreview}>Stop preview</button>
        ) : (
          <button className="btn-secondary" onClick={() => startPreview(device, mode, source)}>Preview camera</button>
        )}
      </div>

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
