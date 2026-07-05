import { useEffect, useRef, useState } from "react";

// Camera device selection + live preview (Settings → Voice). The chosen device
// is persisted and read by App when enabling the camera in voice
// (wavvon.videoInputDevice → getUserMedia video constraint).
const KEY = "wavvon.videoInputDevice";

export function CameraSection() {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState<string>(() => localStorage.getItem(KEY) ?? "");
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  function stopPreview() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPreviewing(false);
  }

  async function refresh() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter((d) => d.kind === "videoinput"));
    } catch {
      setCameras([]);
    }
  }

  useEffect(() => {
    void refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
      stopPreview();
    };
  }, []);

  async function startPreview(deviceId: string) {
    setError(null);
    stopPreview();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setPreviewing(true);
      await refresh(); // labels populate once permission is granted
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function pick(v: string) {
    setDevice(v);
    if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY);
    if (previewing) void startPreview(v);
  }

  return (
    <div className="settings-section" style={{ marginTop: 20 }}>
      <label className="settings-label">Camera</label>
      <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
        Choose which camera to use and preview it. Applies the next time you turn your camera on in voice.
      </p>

      <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
        <select
          aria-label="Camera device"
          value={device}
          onChange={(e) => pick(e.target.value)}
          style={{ width: "100%", maxWidth: 360 }}
        >
          <option value="">System default</option>
          {cameras.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: "var(--space-2)", display: "flex", gap: "var(--space-2)" }}>
        {previewing ? (
          <button className="btn-secondary" onClick={stopPreview}>Stop preview</button>
        ) : (
          <button className="btn-secondary" onClick={() => startPreview(device)}>Preview camera</button>
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
