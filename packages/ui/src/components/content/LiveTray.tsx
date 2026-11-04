import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActiveStream } from "../../types";

/** The lives in a voice room. None opens by itself: a viewer opens the ones
 *  they want, and closing one stops receiving it. */
export interface VoiceLive {
  streams: ActiveStream[];
  opened: Set<string>;
  nameFor: (pubkey: string) => string;
  onOpen: (streamId: string) => void;
  onClose: (streamId: string) => void;
}

export function LiveTray({ streams, opened, nameFor, onOpen, onClose }: VoiceLive) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  if (streams.length === 0) return null;

  const toggle = (s: ActiveStream) => (opened.has(s.stream_id) ? onClose(s.stream_id) : onOpen(s.stream_id));
  const label = (s: ActiveStream) => s.kind === "webcam" ? t("voice.live.camera", { name: nameFor(s.sharer_pubkey) }) : nameFor(s.sharer_pubkey);
  const q = query.trim().toLowerCase();
  const listed = q ? streams.filter((s) => nameFor(s.sharer_pubkey).toLowerCase().includes(q)) : streams;

  return (
    <div className="live-tray" role="group" aria-label={t("voice.live.label")}>
      <div className="live-tray-row">
        <span className="live-tray-title">{t("voice.live.title", { count: streams.length })}</span>
        <div className="live-tray-chips">
          {streams.map((s) => (
            <button
              key={s.stream_id}
              className={`live-chip${opened.has(s.stream_id) ? " open" : ""}`}
              aria-pressed={opened.has(s.stream_id)}
              title={opened.has(s.stream_id) ? t("voice.live.close") : t("voice.live.open")}
              onClick={() => toggle(s)}
            >
              <span className="live-badge">LIVE</span> {label(s)}
            </button>
          ))}
        </div>
        <button className="btn-small btn-secondary" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
          {t("voice.live.all")}
        </button>
      </div>
      {showAll && (
        <div className="live-tray-list">
          <input
            className="input"
            type="search"
            placeholder={t("voice.live.search")}
            aria-label={t("voice.live.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul>
            {listed.map((s) => (
              <li key={s.stream_id} className="settings-row" style={{ justifyContent: "space-between" }}>
                <span>{label(s)}</span>
                <button className={`btn-small${opened.has(s.stream_id) ? " btn-secondary" : ""}`} onClick={() => toggle(s)}>
                  {opened.has(s.stream_id) ? t("voice.live.close") : t("voice.live.open")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
