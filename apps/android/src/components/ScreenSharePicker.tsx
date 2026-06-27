import React, { useEffect, useState } from "react";
import type { ScreenShareOpts } from "../types";
import { FocusTrap } from "@wavvon/ui";

interface Props {
  onStart: (opts: ScreenShareOpts) => void;
  onCancel: () => void;
}

export function ScreenSharePicker({ onStart, onCancel }: Props) {
  const [includeAudio, setIncludeAudio] = useState(false);
  const [includeWebcam, setIncludeWebcam] = useState(false);
  const [webcamDeviceId, setWebcamDeviceId] = useState("");
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    if (!includeWebcam) return;
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const cams = devices.filter((d) => d.kind === "videoinput");
      setVideoDevices(cams);
      if (cams.length > 0 && !webcamDeviceId) {
        setWebcamDeviceId(cams[0].deviceId);
      }
    }).catch(() => {});
  }, [includeWebcam]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="screen-share-picker-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <FocusTrap>
      <div className="screen-share-picker" role="dialog" aria-modal="true" aria-labelledby="screen-share-title">
        <h2 id="screen-share-title">Share your screen</h2>

        <label className="settings-row">
          <input
            type="checkbox"
            checked={includeAudio}
            onChange={(e) => setIncludeAudio(e.target.checked)}
          />
          <span>Include system audio</span>
        </label>

        {includeAudio && (
          <p className="screen-share-macos-notice">
            On macOS, system audio requires a virtual audio driver (e.g. BlackHole).
          </p>
        )}

        <label className="settings-row">
          <input
            type="checkbox"
            checked={includeWebcam}
            onChange={(e) => setIncludeWebcam(e.target.checked)}
          />
          <span>Share webcam</span>
        </label>

        {includeWebcam && videoDevices.length > 0 && (
          <select
            aria-label="Camera"
            value={webcamDeviceId}
            onChange={(e) => setWebcamDeviceId(e.target.value)}
          >
            {videoDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${d.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        )}

        <div className="picker-actions">
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="primary"
            onClick={() => onStart({ includeAudio, includeWebcam, webcamDeviceId })}
          >
            Start sharing
          </button>
        </div>
      </div>
      </FocusTrap>
    </div>
  );
}
