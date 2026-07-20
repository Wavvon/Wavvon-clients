import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { Channel, HubIcon } from "../types";
import { ChannelIcon } from "@wavvon/ui";
import { ChannelIconPicker } from "./ChannelIconPicker";
import { sanitizeSvg } from "../utils/svgSanitize";
import { FocusTrap } from "@wavvon/ui";

const ACCENT_COLORS = [
  { id: "red",    hex: "#e74c3c" },
  { id: "orange", hex: "#e67e22" },
  { id: "yellow", hex: "#f39c12" },
  { id: "green",  hex: "#27ae60" },
  { id: "teal",   hex: "#16a085" },
  { id: "blue",   hex: "#2980b9" },
  { id: "purple", hex: "#8e44ad" },
  { id: "pink",   hex: "#e91e63" },
  { id: "gray",   hex: "#7f8c8d" },
];

interface Props {
  channel: Channel;
  onSave: (icon: string | null, color: string | null, customIconSvg: string | null) => void;
  onClose: () => void;
}

export function ChannelAppearanceModal({ channel, onSave, onClose }: Props) {
  const { t } = useTranslation();
  const [icon, setIcon] = useState<string | null>(channel.icon);
  const [color, setColor] = useState<string | null>(channel.color);
  const [customIconSvg, setCustomIconSvg] = useState<string | null>(channel.custom_icon_svg);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [hubIcons, setHubIcons] = useState<HubIcon[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    invoke<HubIcon[]>("list_hub_icons").then(setHubIcons).catch(() => {});
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".svg")) {
      setUploadError("Only .svg files are supported.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const clean = sanitizeSvg(text);
      if (!clean) {
        setUploadError("Invalid or unsafe SVG — check the file and try again.");
      } else {
        setCustomIconSvg(clean);
        setUploadError(null);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
      <div className="modal appearance-modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          {t("channel.appearance.title")} —{" "}
          {channel.is_category ? channel.name.toUpperCase() : `#${channel.name}`}
        </h3>

        <div className="settings-section">
          <label className="settings-label">{t("channel.appearance.custom_svg")}</label>
          <p className="muted">
            Upload your own .svg file. Scripts and external references are
            stripped automatically.
          </p>
          {hubIcons.length > 0 && (
            <div className="hub-icon-library">
              <p className="muted" style={{ marginBottom: "6px" }}>{t("channel.appearance.hub_library")}</p>
              <div className="icon-picker-grid">
                {hubIcons.map((hi) => {
                  const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(hi.svg_content)}`;
                  const isSelected = customIconSvg === hi.svg_content;
                  return (
                    <button
                      key={hi.id}
                      type="button"
                      className={`icon-picker-tile ${isSelected ? "selected" : ""}`}
                      onClick={() => { setCustomIconSvg(hi.svg_content); setIcon(null); }}
                      title={hi.name}
                    >
                      <span className="icon-picker-glyph">
                        <img src={dataUri} width={18} height={18} style={{ objectFit: "contain" }} aria-hidden="true" />
                      </span>
                      <span className="icon-picker-label">{hi.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="custom-icon-upload-row">
            {customIconSvg && (
              <>
                <div className="custom-icon-preview">
                  <ChannelIcon icon={null} customIconSvg={customIconSvg} size={32} />
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCustomIconSvg(null)}
                >
                  {t("modal.delete")}
                </button>
              </>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fileRef.current?.click()}
            >
              {customIconSvg ? t("channel.appearance.replace_svg") : t("channel.appearance.upload_svg")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".svg,image/svg+xml"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
          </div>
          {uploadError && (
            <p style={{ color: "var(--color-error, red)", marginTop: "4px" }}>
              {uploadError}
            </p>
          )}
        </div>

        <div className="settings-section">
          <label className="settings-label">
            {t("channel.appearance.predefined")}{customIconSvg ? " (overridden by custom SVG)" : ""}
          </label>
          <div style={{ opacity: customIconSvg ? 0.4 : 1, pointerEvents: customIconSvg ? "none" : "auto" }}>
            <ChannelIconPicker value={icon} onChange={setIcon} />
          </div>
        </div>

        {channel.is_category && (
          <div className="settings-section">
            <label className="settings-label">{t("channel.appearance.color")}</label>
            <div className="color-swatch-row">
              <button
                type="button"
                className={`color-swatch color-swatch-none ${color === null ? "selected" : ""}`}
                onClick={() => setColor(null)}
                title={t("channel.appearance.no_color")}
              >
                ✕
              </button>
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`color-swatch ${color === c.hex ? "selected" : ""}`}
                  style={{ background: c.hex }}
                  onClick={() => setColor(c.hex)}
                  title={c.id}
                />
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            {t("modal.cancel")}
          </button>
          <button onClick={() => { onSave(icon, color, customIconSvg); onClose(); }}>
            {t("modal.save")}
          </button>
        </div>
      </div>
      </FocusTrap>
    </div>
  );
}
