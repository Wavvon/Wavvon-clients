import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  stream: MediaStream | null;
  kbps?: number;
  onStop: () => void;
}

export function ScreenShareSelfPreview({ stream, kbps, onStop }: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      if (stream) void videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  if (!stream) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        className="screen-share-self-preview-badge"
        onClick={() => setCollapsed(false)}
        title={t("voice.self_preview.expand")}
        aria-label={t("voice.self_preview.expand")}
      >
        {t("voice.sharing")}
      </button>
    );
  }

  return (
    <div className="screen-share-self-preview">
      <video ref={videoRef} muted playsInline className="screen-share-self-preview-video" />
      <div className="screen-share-self-preview-bar">
        <span className="screen-share-self-preview-label">{t("voice.sharing")}</span>
        {(kbps ?? 0) > 0 && <span className="muted">{kbps} kbps</span>}
        <div className="screen-share-self-preview-actions">
          <button
            type="button"
            className="btn-small"
            onClick={() => setCollapsed(true)}
            title={t("voice.self_preview.collapse")}
            aria-label={t("voice.self_preview.collapse")}
          >
            &minus;
          </button>
          <button type="button" className="stop-btn" onClick={onStop}>
            {t("voice.screen_share.stop")}
          </button>
        </div>
      </div>
    </div>
  );
}
