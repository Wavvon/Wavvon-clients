import { useEffect, useRef, useState } from "react";

// A "test your mic" level meter: opens its own microphone stream, runs it
// through an AnalyserNode, and animates a bar from the RMS level. Fully
// client-side (no hub involvement); ported from the desktop MicLevelMeter.
// The stream is opened only while testing and always released on stop.
export function MicLevelMeter() {
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0); // 0..1
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  function stop() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    setLevel(0);
    setTesting(false);
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      setTesting(true);

      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        // RMS around the 128 midpoint → 0..1.
        let sumSq = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / buf.length);
        setLevel(Math.min(1, rms * 2.5));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      stop();
    }
  }

  // Always release the mic when the component unmounts.
  useEffect(() => () => stop(), []);

  const pct = Math.round(level * 100);

  return (
    <div className="settings-section" style={{ marginTop: 16 }}>
      <label className="settings-label">Microphone test</label>
      <div className="settings-row" style={{ alignItems: "center", gap: 12 }}>
        <button type="button" onClick={testing ? stop : start}>
          {testing ? "Stop test" : "Test microphone"}
        </button>
        <div
          role="meter"
          aria-label="Microphone level"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{
            flex: 1,
            height: 12,
            borderRadius: 6,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: level > 0.8 ? "var(--danger)" : "var(--accent)",
              transition: "width 60ms linear",
            }}
          />
        </div>
      </div>
      {error && <p className="error-text" style={{ fontSize: "var(--text-sm)" }}>{error}</p>}
      {testing && <p className="muted" style={{ fontSize: "var(--text-xs)" }}>Speak — the bar should move.</p>}
    </div>
  );
}
