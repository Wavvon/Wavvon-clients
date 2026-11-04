import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ScreenShareOpts } from "../types";
import { ShareDialog, type StreamLimits } from "@wavvon/ui";

interface Props {
  loadLimits: () => Promise<StreamLimits | undefined>;
  onStart: (opts: ScreenShareOpts) => void;
  onCancel: () => void;
}

// The shared dialog plus the webcam the desktop can send beside the screen.
export function ScreenShareModal({ loadLimits, onStart, onCancel }: Props) {
  const { t } = useTranslation();
  const [includeWebcam, setIncludeWebcam] = useState(false);
  const [webcamDeviceId, setWebcamDeviceId] = useState("");
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    if (!includeWebcam) return;
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const cams = devices.filter((d) => d.kind === "videoinput");
      setVideoDevices(cams);
      if (cams.length > 0 && !webcamDeviceId) setWebcamDeviceId(cams[0].deviceId);
    }).catch(() => {});
  }, [includeWebcam]);

  return (
    <ShareDialog
      loadLimits={loadLimits}
      onStart={(quality) => onStart({ quality, includeWebcam, webcamDeviceId })}
      onCancel={onCancel}
    >
      <label className="settings-row">
        <input
          type="checkbox"
          checked={includeWebcam}
          onChange={(e) => setIncludeWebcam(e.target.checked)}
        />
        <span>{t("voice.screen_share.picker.share_webcam")}</span>
      </label>

      {includeWebcam && videoDevices.length > 0 && (
        <select
          aria-label={t("voice.screen_share.picker.camera_aria")}
          value={webcamDeviceId}
          onChange={(e) => setWebcamDeviceId(e.target.value)}
        >
          {videoDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label ||
                t("voice.screen_share.picker.camera_fallback", { id: d.deviceId.slice(0, 8) })}
            </option>
          ))}
        </select>
      )}
    </ShareDialog>
  );
}
