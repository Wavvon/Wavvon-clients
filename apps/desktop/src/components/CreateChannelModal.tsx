import React from "react";
import { useTranslation } from "react-i18next";
import { FocusTrap } from "@wavvon/ui";

interface Props {
  name: string;
  onNameChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  channelType: "text" | "forum" | "category" | "banner";
  onChannelTypeChange: (v: "text" | "forum" | "category" | "banner") => void;
  bannerUrl: string;
  onBannerUrlChange: (v: string) => void;
  bannerSourceMode: "url" | "upload";
  onBannerSourceModeChange: (v: "url" | "upload") => void;
  bannerFile: File | null;
  onBannerFileChange: (f: File | null) => void;
  parentId: string | null;
  onCreate: () => void;
  onClose: () => void;
}

export function CreateChannelModal({
  name, onNameChange, description, onDescriptionChange,
  channelType, onChannelTypeChange,
  bannerUrl, onBannerUrlChange,
  bannerSourceMode, onBannerSourceModeChange,
  bannerFile, onBannerFileChange,
  parentId, onCreate, onClose,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-channel-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="create-channel-title">
          Create…{parentId ? t("channel.create.inside_category") : ""}
        </h3>
        <p className="modal-section-label">Space type</p>
        <div className="channel-type-row">
          {(["text", "forum", "category", "banner"] as const).map((ty) => (
            <button key={ty} type="button"
              className={`channel-type-btn ${channelType === ty ? "selected" : ""}`}
              onClick={() => onChannelTypeChange(ty)}>
              {ty === "text" ? "Channel"
               : ty === "forum" ? "Forum"
               : ty === "category" ? "Category"
               : "Banner"}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCreate();
            if (e.key === "Escape") onClose();
          }}
          placeholder={channelType === "category" ? t("channel.create.name_placeholder_category") : "Internal name"}
          maxLength={64}
          autoFocus
        />
        {channelType === "banner" && (
          <div className="settings-section">
            <div className="channel-type-row">
              {(["url", "upload"] as const).map((mode) => (
                <button key={mode} type="button"
                  className={`channel-type-btn ${bannerSourceMode === mode ? "selected" : ""}`}
                  onClick={() => onBannerSourceModeChange(mode)}>
                  {mode === "url" ? "External URL" : "Hub upload"}
                </button>
              ))}
            </div>
            {bannerSourceMode === "url" ? (
              <input
                type="url"
                value={bannerUrl}
                onChange={(e) => onBannerUrlChange(e.target.value)}
                placeholder="https://example.com/banner.png"
                maxLength={2048}
              />
            ) : (
              <div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  onChange={(e) => onBannerFileChange(e.target.files?.[0] ?? null)}
                />
                {bannerFile && (
                  <p className="muted" style={{ marginTop: 4 }}>{bannerFile.name}</p>
                )}
              </div>
            )}
          </div>
        )}
        {channelType !== "category" && channelType !== "banner" && (
          <textarea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder={t("channel.create.description_placeholder")}
            rows={3}
            maxLength={280}
          />
        )}
        <div className="modal-actions">
          <button onClick={onClose} className="btn-secondary">{t("modal.cancel")}</button>
          <button onClick={onCreate}>{t("modal.create")}</button>
        </div>
      </div>
      </FocusTrap>
    </div>
  );
}
