import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FocusTrap } from "../FocusTrap";
import type { Channel } from "@wavvon/core";

interface Props {
  channel: Channel;
  onSave: (channelId: string, bannerUrl: string) => void;
  onClose: () => void;
}

export function BannerEditModal({ channel, onSave, onClose }: Props) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(channel.banner_url ?? "");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
        <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
          <h3>{t("channel.banner.edit_title")}</h3>
          <div className="settings-section">
            <label className="settings-label" htmlFor="banner-url-input">
              {t("channel.create.banner_source_url")}
            </label>
            <input
              id="banner-url-input"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/image.png"
              style={{ width: "100%", boxSizing: "border-box" }}
              autoFocus
            />
            {url && (
              <img
                src={url}
                alt={t("channel.banner.preview_alt")}
                style={{ marginTop: 8, width: "100%", height: "auto", borderRadius: 4, display: "block" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                onLoad={(e) => { (e.target as HTMLImageElement).style.display = "block"; }}
              />
            )}
          </div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>{t("modal.cancel")}</button>
            <button
              onClick={() => { onSave(channel.id, url.trim()); onClose(); }}
              disabled={!url.trim()}
            >
              {t("modal.save")}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
