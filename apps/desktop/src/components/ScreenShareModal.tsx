import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ScreenShareOpts } from "../types";
import { FocusTrap } from "@wavvon/ui";

interface Props {
  onStart: (opts: ScreenShareOpts) => void;
  onCancel: () => void;
}

export function ScreenShareModal({ onStart, onCancel }: Props) {
  const { t } = useTranslation();
  const [includeAudio, setIncludeAudio] = useState(false);
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // The screen or window itself is chosen in the system picker that
  // getDisplayMedia opens: WebView2 offers no way to preselect one.
  function handleShare() {
    onStart({ includeAudio, includeWebcam, webcamDeviceId });
  }

  return (
    <div className="screen-share-picker-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <FocusTrap>
        <div className="screen-share-picker" role="dialog" aria-modal="true" aria-labelledby="screen-share-title">
          <h2 id="screen-share-title">{t("voice.screen_share.picker.title")}</h2>

          <div className="settings-section">
            <label className="settings-row">
              <input
                type="checkbox"
                checked={includeAudio}
                onChange={(e) => setIncludeAudio(e.target.checked)}
              />
              <span>{t("voice.screen_share.picker.include_audio")}</span>
            </label>

            {includeAudio && (
              <p className="screen-share-macos-notice">
                {t("voice.screen_share.picker.macos_notice")}
              </p>
            )}

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
          </div>

          <div className="picker-actions">
            <button className="btn-secondary" onClick={onCancel}>
              {t("modal.cancel")}
            </button>
            <button className="primary" onClick={handleShare}>
              {t("voice.screen_share.picker.share_button")}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
