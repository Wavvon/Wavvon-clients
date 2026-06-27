import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { FocusTrap } from "@wavvon/ui";

interface Props {
  initialIsCategory?: boolean;
  parentId: string | null;
  parentName?: string | null;
  loading: boolean;
  error: string | null;
  onSubmit: (name: string, channelType: string, isCategory: boolean, description: string) => void;
  onClose: () => void;
}

type ChannelKind = "text" | "forum" | "banner" | "category";

export function CreateChannelModal({ initialIsCategory, parentId, parentName, loading, error, onSubmit, onClose }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ChannelKind>(initialIsCategory ? "category" : "text");
  const [description, setDescription] = useState("");

  const isCategory = kind === "category";

  function handleSubmit() {
    if (!name.trim()) return;
    onSubmit(name.trim(), isCategory ? "text" : kind, isCategory, description.trim());
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

          {!isCategory && (
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
