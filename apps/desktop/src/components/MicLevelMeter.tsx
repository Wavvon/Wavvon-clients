import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MIC_METER_MAX } from "../constants";

export function MicLevelMeter({
  level,
  threshold,
  onChange,
}: {
  level: number;
  threshold: number;
  onChange: (v: number) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function valueAt(clientX: number): number {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return threshold;
    const pct = (clientX - rect.left) / rect.width;
    const v = Math.max(0.001, Math.min(MIC_METER_MAX, pct * MIC_METER_MAX));
    return v;
  }

  function handleDown(e: React.MouseEvent) {
    dragging.current = true;
    onChange(valueAt(e.clientX));
  }

  function handleKey(e: React.KeyboardEvent) {
    const step = MIC_METER_MAX / 100;
    const delta = e.key === "ArrowRight" || e.key === "ArrowUp" ? step : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -step : 0;
    if (!delta) return;
    e.preventDefault();
    onChange(Math.max(0.001, Math.min(MIC_METER_MAX, threshold + delta)));
  }

  useEffect(() => {
    function up() {
      dragging.current = false;
    }
    function move(e: MouseEvent) {
      if (!dragging.current) return;
      onChange(valueAt(e.clientX));
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [onChange]);

  const fillPct = Math.min(100, (level / MIC_METER_MAX) * 100);
  const markerPct = Math.min(100, (threshold / MIC_METER_MAX) * 100);
  const triggered = level >= threshold;

  return (
    <div
      className="mic-meter"
      ref={ref}
      onMouseDown={handleDown}
      onKeyDown={handleKey}
      role="slider"
      tabIndex={0}
      aria-label={t("settings.voice.vad.sensitivity")}
      aria-valuemin={0}
      aria-valuemax={MIC_METER_MAX}
      aria-valuenow={threshold}
    >
      <div
        className={`mic-meter-fill ${triggered ? "triggered" : ""}`}
        style={{ width: `${fillPct}%` }}
      />
      <div className="mic-meter-marker" style={{ left: `${markerPct}%` }} />
    </div>
  );
}
