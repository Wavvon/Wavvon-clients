import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { Channel, HubIcon } from "../types";
import { ChannelIcon } from "./Icons";
import { ChannelIconPicker } from "./ChannelIconPicker";
import { sanitizeSvg } from "../utils/svgSanitize";
import { FocusTrap } from "./FocusTrap";

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

type Tab = "settings" | "moderation";

interface Props {
  channel: Channel;
  isAdmin: boolean;
  onSaveAppearance: (icon: string | null, color: string | null, customIconSvg: string | null) => void;
  onSaveDescription: (description: string) => void;
  onManageBans: () => void;
  onClose: () => void;
}

export function ChannelSettingsModal({
  channel, isAdmin, onSaveAppearance, onSaveDescription, onManageBans, onClose,
}: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("settings");

  const [description, setDescription] = useState(channel.description ?? "");
  const [icon, setIcon] = useState<string | null>(channel.icon);
  const [color, setColor] = useState<string | null>(channel.color);
  const [customIconSvg, setCustomIconSvg] = useState<string | null>(channel.custom_icon_svg);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [hubIcons, setHubIcons] = useState<HubIcon[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [talkPower, setTalkPower] = useState(0);
  const [talkPowerInput, setTalkPowerInput] = useState("0");
  const [talkPowerSaved, setTalkPowerSaved] = useState(false);

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

  useEffect(() => {
    if (tab !== "moderation" || !isAdmin) return;
    invoke<{ min_talk_power: number }>("get_talk_power", { channelId: channel.id })
      .then((tp) => {
        setTalkPower(tp.min_talk_power);
        setTalkPowerInput(String(tp.min_talk_power));
      })
      .catch(() => {});
  }, [tab, channel.id, isAdmin]);

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

  async function handleSaveTalkPower() {
    const n = Number(talkPowerInput);
    if (!Number.isFinite(n) || n < 0) return;
    const val = Math.floor(n);
    try {
      await invoke("set_talk_power_cmd", { channelId: channel.id, minTalkPower: val });
      setTalkPower(val);
      setTalkPowerSaved(true);
      setTimeout(() => setTalkPowerSaved(false), 1500);
    } catch {}
  }

  const title = channel.is_category
    ? `Category Settings — ${channel.name.toUpperCase()}`
    : `Channel Settings — #${channel.name}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
      <div className="modal appearance-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>

        <div className="hub-admin-tabs">
          <button
            className={`hub-admin-tab ${tab === "settings" ? "active" : ""}`}
            onClick={() => setTab("settings")}
          >
            {t("channel.settings.tab_settings")}
          </button>
          {isAdmin && (
            <button
              className={`hub-admin-tab ${tab === "moderation" ? "active" : ""}`}
              onClick={() => setTab("moderation")}
            >
              {t("channel.settings.tab_moderation")}
            </button>
          )}
        </div>

        {tab === "settings" && (
          <>
            {!channel.is_category && (
              <div className="settings-section">
                <label className="settings-label">{t("channel.settings.description")}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Channel description (shown in the channel header)"
                  rows={3}
                />
              </div>
            )}

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
                Predefined icon{customIconSvg ? " (overridden by custom SVG)" : ""}
              </label>
              <div style={{ opacity: customIconSvg ? 0.4 : 1, pointerEvents: customIconSvg ? "none" : "auto" }}>
                <ChannelIconPicker value={icon} onChange={setIcon} />
              </div>
            </div>

            {channel.is_category && (
              <div className="settings-section">
                <label className="settings-label">Accent color</label>
                <div className="color-swatch-row">
                  <button
                    type="button"
                    className={`color-swatch color-swatch-none ${color === null ? "selected" : ""}`}
                    onClick={() => setColor(null)}
                    title="None"
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
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button onClick={() => {
                if (!channel.is_category) onSaveDescription(description);
                onSaveAppearance(icon, color, customIconSvg);
                onClose();
              }}>
                Save
              </button>
            </div>
          </>
        )}

        {tab === "moderation" && isAdmin && (
          <>
            <div className="settings-section">
              <label className="settings-label" htmlFor="channel-talk-power">Talk power</label>
              <p className="muted">
                Minimum priority required to speak in this channel. 0 allows anyone.
              </p>
              <div className="settings-row">
                <input
                  id="channel-talk-power"
                  type="number"
                  min={0}
                  value={talkPowerInput}
                  onChange={(e) => setTalkPowerInput(e.target.value)}
                  style={{ width: "80px" }}
                />
                <button onClick={handleSaveTalkPower}>
                  {talkPowerSaved ? "Saved" : "Save"}
                </button>
              </div>
              <p className="muted">Current: {talkPower}</p>
            </div>

            <div className="settings-section">
              <label className="settings-label">Bans</label>
              <div className="settings-row">
                <button className="btn-secondary" onClick={() => { onManageBans(); onClose(); }}>
                  Open ban list
                </button>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
      </FocusTrap>
    </div>
  );
}
