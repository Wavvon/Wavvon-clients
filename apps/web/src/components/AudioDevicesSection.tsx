import { useEffect, useState } from "react";

// Input/output device selection for voice (Settings → Voice). The choices are
// persisted to localStorage and read by VoiceWsSession on join
// (wavvon.audioInputDevice → getUserMedia, wavvon.audioOutputDevice →
// AudioContext.setSinkId where supported).
const INPUT_KEY = "wavvon.audioInputDevice";
const OUTPUT_KEY = "wavvon.audioOutputDevice";

export function AudioDevicesSection() {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [input, setInput] = useState<string>(() => localStorage.getItem(INPUT_KEY) ?? "");
  const [output, setOutput] = useState<string>(() => localStorage.getItem(OUTPUT_KEY) ?? "");
  const [needsPermission, setNeedsPermission] = useState(false);
  const supportsOutput = typeof (AudioContext.prototype as { setSinkId?: unknown }).setSinkId === "function";

  async function refresh() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const ins = devices.filter((d) => d.kind === "audioinput");
      const outs = devices.filter((d) => d.kind === "audiooutput");
      setInputs(ins);
      setOutputs(outs);
      // Labels are blank until mic permission is granted at least once.
      setNeedsPermission(ins.length > 0 && ins.every((d) => !d.label));
    } catch {
      setInputs([]);
      setOutputs([]);
    }
  }

  useEffect(() => {
    void refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
  }, []);

  async function grantAndRefresh() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      await refresh();
    } catch { /* denied */ }
  }

  function pickInput(v: string) {
    setInput(v);
    if (v) localStorage.setItem(INPUT_KEY, v); else localStorage.removeItem(INPUT_KEY);
  }
  function pickOutput(v: string) {
    setOutput(v);
    if (v) localStorage.setItem(OUTPUT_KEY, v); else localStorage.removeItem(OUTPUT_KEY);
  }

  const label = (d: MediaDeviceInfo, i: number) => d.label || `Device ${i + 1}`;

  return (
    <div className="settings-section" style={{ marginTop: 20 }}>
      <label className="settings-label">Audio devices</label>
      <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
        Choose which microphone and speakers voice uses. Changes apply the next time you join a voice channel.
      </p>

      {needsPermission && (
        <button className="btn-secondary" onClick={grantAndRefresh} style={{ marginBottom: 8 }}>
          Allow microphone access to list devices
        </button>
      )}

      <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
        <label className="settings-label" style={{ fontSize: "var(--text-sm)" }} htmlFor="audio-input">Microphone</label>
        <select id="audio-input" value={input} onChange={(e) => pickInput(e.target.value)} style={{ width: "100%", maxWidth: 360 }}>
          <option value="">System default</option>
          {inputs.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{label(d, i)}</option>)}
        </select>
      </div>

      <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4, marginTop: "var(--space-2)" }}>
        <label className="settings-label" style={{ fontSize: "var(--text-sm)" }} htmlFor="audio-output">Speakers</label>
        <select id="audio-output" value={output} onChange={(e) => pickOutput(e.target.value)} disabled={!supportsOutput} style={{ width: "100%", maxWidth: 360 }}>
          <option value="">System default</option>
          {outputs.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{label(d, i)}</option>)}
        </select>
        {!supportsOutput && (
          <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
            Your browser can't switch output device; it uses the system default.
          </span>
        )}
      </div>
    </div>
  );
}
