import React, { useEffect, useState } from "react";
import { FocusTrap } from "@wavvon/ui";
import type { Channel } from "@wavvon/core";

interface Props {
  channel: Channel;
  onSave: (channelId: string, bannerUrl: string) => void;
  onClose: () => void;
}

export function BannerEditModal({ channel, onSave, onClose }: Props) {
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
          <h3>Edit Banner</h3>
          <div className="settings-section">
            <label className="settings-label" htmlFor="banner-url-input">
              Image URL
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
                alt="Preview"
                style={{ marginTop: 8, width: "100%", height: "auto", borderRadius: 4, display: "block" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                onLoad={(e) => { (e.target as HTMLImageElement).style.display = "block"; }}
              />
            )}
          </div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              onClick={() => { onSave(channel.id, url.trim()); onClose(); }}
              disabled={!url.trim()}
            >
              Save
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
