import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { FocusTrap } from "@wavvon/ui";
import { normalizeSpawnerNameTemplate } from "../utils/spawnerChannels";

export interface BannerSource {
  url?: string;
  file?: File | null;
}

interface Props {
  initialIsCategory?: boolean;
  parentId: string | null;
  parentName?: string | null;
  loading: boolean;
  error: string | null;
  onSubmit: (name: string, channelType: string, isCategory: boolean, description: string, spawnerNameTemplate?: string, banner?: BannerSource) => void;
  onClose: () => void;
}

type ChannelKind = "text" | "forum" | "banner" | "spawner" | "category";

// Hub-side banner upload cap (banner-channels.md): 512 KB, image formats only.
const BANNER_MAX_BYTES = 512 * 1024;
const BANNER_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export function CreateChannelModal({ initialIsCategory, parentId, parentName, loading, error, onSubmit, onClose }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ChannelKind>(initialIsCategory ? "category" : "text");
  const [description, setDescription] = useState("");
  const [spawnerNameTemplate, setSpawnerNameTemplate] = useState("");
  const [bannerSourceMode, setBannerSourceMode] = useState<"url" | "upload">("url");
  const [bannerUrl, setBannerUrl] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerFileError, setBannerFileError] = useState<string | null>(null);

  const isCategory = kind === "category";
  const isSpawner = kind === "spawner";
  const isBanner = kind === "banner";

  function handlePickBannerFile(file: File | null) {
    setBannerFileError(null);
    if (!file) { setBannerFile(null); return; }
    if (!BANNER_MIME_TYPES.includes(file.type)) {
      setBannerFileError(t("channel.create.banner_bad_type"));
      setBannerFile(null);
      return;
    }
    if (file.size > BANNER_MAX_BYTES) {
      setBannerFileError(t("channel.create.banner_too_large"));
      setBannerFile(null);
      return;
    }
    setBannerFile(file);
  }

  function handleSubmit() {
    if (!name.trim()) return;
    onSubmit(
      name.trim(),
      isCategory ? "text" : kind,
      isCategory,
      description.trim(),
      isSpawner ? normalizeSpawnerNameTemplate(spawnerNameTemplate) : undefined,
      isBanner
        ? bannerSourceMode === "url"
          ? { url: bannerUrl.trim() || undefined }
          : { file: bannerFile }
        : undefined,
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-channel-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="create-channel-title">{t("channel.create.title_channel")}</h3>

          {parentName && (
            <p className="muted" style={{ marginBottom: "var(--space-3)", fontSize: "var(--text-sm)" }}>
              <strong>{t("channel.create.under_category", { name: parentName })}</strong>
            </p>
          )}

          <label style={{ display: "block", marginBottom: "var(--space-2)" }}>
            <span className="label-text">{t("channel.create.type_label")}</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ChannelKind)}
              style={{ display: "block", width: "100%", marginTop: 4 }}
            >
              <option value="text">{t("channel.create.type_text")}</option>
              <option value="forum">{t("channel.create.type_forum")}</option>
              <option value="banner">{t("channel.create.type_banner")}</option>
              <option value="spawner">{t("channel.create.type_spawner")}</option>
              <option value="category">{t("channel.create.type_category")}</option>
            </select>
          </label>

          <label style={{ display: "block", marginBottom: "var(--space-2)" }}>
            <span className="label-text">{t("channel.create.name_label")}</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
                if (e.key === "Escape") onClose();
              }}
              placeholder={isCategory ? t("channel.create.name_placeholder_category") : t("channel.create.name_placeholder_channel")}
              autoFocus
              style={{ display: "block", width: "100%", marginTop: 4 }}
            />
          </label>

          {isBanner && (
            <div style={{ marginBottom: "var(--space-3)" }}>
              <span className="label-text">{t("channel.create.banner_source_label")}</span>
              <div style={{ display: "flex", gap: 8, margin: "4px 0 8px" }}>
                {(["url", "upload"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={bannerSourceMode === mode ? "btn-small" : "btn-small btn-secondary"}
                    aria-pressed={bannerSourceMode === mode}
                    onClick={() => setBannerSourceMode(mode)}
                  >
                    {mode === "url" ? t("channel.create.banner_source_url") : t("channel.create.banner_source_upload")}
                  </button>
                ))}
              </div>
              {bannerSourceMode === "url" ? (
                <input
                  type="text"
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmit();
                    if (e.key === "Escape") onClose();
                  }}
                  placeholder="https://example.com/banner.png"
                  style={{ display: "block", width: "100%" }}
                />
              ) : (
                <>
                  <input
                    type="file"
                    accept={BANNER_MIME_TYPES.join(",")}
                    onChange={(e) => handlePickBannerFile(e.target.files?.[0] ?? null)}
                    style={{ display: "block", width: "100%" }}
                  />
                  {bannerFile && (
                    <span className="muted" style={{ fontSize: "var(--text-xs)" }}>{bannerFile.name}</span>
                  )}
                  {bannerFileError && (
                    <span style={{ color: "var(--danger)", fontSize: "var(--text-xs)", display: "block" }}>{bannerFileError}</span>
                  )}
                </>
              )}
              <span className="muted" style={{ fontSize: "var(--text-xs)", display: "block", marginTop: 4 }}>
                {t("channel.create.banner_hint")}
              </span>
            </div>
          )}

          {isSpawner && (
            <label style={{ display: "block", marginBottom: "var(--space-3)" }}>
              <span className="label-text">{t("channel.create.spawner_template_label")}</span>
              <input
                type="text"
                value={spawnerNameTemplate}
                onChange={(e) => setSpawnerNameTemplate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                  if (e.key === "Escape") onClose();
                }}
                placeholder={t("channel.create.spawner_template_placeholder", { ph: "{user}" })}
                style={{ display: "block", width: "100%", marginTop: 4 }}
              />
              <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                {t("channel.create.spawner_template_hint", { ph: "{user}", def: "{user}'s room" })}
              </span>
            </label>
          )}

          {!isCategory && !isSpawner && !isBanner && (
            <label style={{ display: "block", marginBottom: "var(--space-3)" }}>
              <span className="label-text">{t("channel.create.description_label")}</span>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                  if (e.key === "Escape") onClose();
                }}
                placeholder={t("channel.create.description_hint")}
                style={{ display: "block", width: "100%", marginTop: 4 }}
              />
            </label>
          )}

          <div className="modal-actions">
            <button onClick={onClose} className="btn-secondary">{t("modal.cancel")}</button>
            <button onClick={handleSubmit} disabled={loading || !name.trim()}>
              {loading ? t("modal.creating") : t("modal.create")}
            </button>
          </div>

          {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
        </div>
      </FocusTrap>
    </div>
  );
}
