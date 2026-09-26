import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import type { ScreenShareOpts } from "../types";
import { FocusTrap } from "@wavvon/ui";

interface CaptureSource {
  id: string;
  name: string;
  kind: "screen" | "window";
  thumbnail_b64: string;
}

interface Props {
  onStart: (opts: ScreenShareOpts) => void;
  onCancel: () => void;
}

export function ScreenShareModal({ onStart, onCancel }: Props) {
  const { t } = useTranslation();
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"screen" | "window">("screen");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [includeAudio, setIncludeAudio] = useState(false);
  const [includeWebcam, setIncludeWebcam] = useState(false);
  const [webcamDeviceId, setWebcamDeviceId] = useState("");
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    invoke<CaptureSource[]>("list_capture_sources")
      .then((srcs) => {
        setSources(srcs);
        const firstScreen = srcs.find((s) => s.kind === "screen");
        if (firstScreen) setSelectedId(firstScreen.id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

  const visibleSources = sources.filter((s) => s.kind === tab);

  function handleShare() {
    if (!selectedId) return;
    onStart({ sourceId: selectedId, includeAudio, includeWebcam, webcamDeviceId });
  }

  return (
    <div className="screen-share-picker-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <FocusTrap>
        <div className="screen-share-picker" role="dialog" aria-modal="true" aria-labelledby="screen-share-title">
          <h2 id="screen-share-title">{t("voice.screen_share.picker.title")}</h2>

          <div className="channel-type-row">
            <button
              type="button"
              className={`channel-type-btn ${tab === "screen" ? "selected" : ""}`}
              onClick={() => setTab("screen")}
            >
              {t("voice.screen_share.picker.tab_screens")}
            </button>
            <button
              type="button"
              className={`channel-type-btn ${tab === "window" ? "selected" : ""}`}
              onClick={() => setTab("window")}
            >
              {t("voice.screen_share.picker.tab_windows")}
            </button>
          </div>

          <div className="screen-share-source-grid">
            {loading && <p className="muted">{t("voice.screen_share.picker.loading")}</p>}
            {!loading && visibleSources.length === 0 && (
              <p className="muted">
                {tab === "screen"
                  ? t("voice.screen_share.picker.empty_screens")
                  : t("voice.screen_share.picker.empty_windows")}
              </p>
            )}
            {visibleSources.map((src) => (
              <button
                key={src.id}
                type="button"
                className={`screen-share-source-thumb ${selectedId === src.id ? "selected" : ""}`}
                onClick={() => setSelectedId(src.id)}
              >
                <img
                  src={`data:image/png;base64,${src.thumbnail_b64}`}
                  alt={src.name}
                  draggable={false}
                />
                <span className="screen-share-source-name">
                  {src.name || t("voice.screen_share.picker.unnamed")}
                </span>
              </button>
            ))}
          </div>

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
            <button
              className="primary"
              disabled={!selectedId}
              onClick={handleShare}
            >
              {t("voice.screen_share.picker.share_button")}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
