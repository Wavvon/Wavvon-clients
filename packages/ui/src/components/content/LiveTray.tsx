import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActiveStream } from "../../types";
import { Avatar } from "../Avatar";
import { SearchIcon } from "../Icons";

/** The lives in a voice room. None opens by itself: a viewer opens the ones
 *  they want, and closing one stops receiving it. */
export interface VoiceLive {
  streams: ActiveStream[];
  opened: Set<string>;
  nameFor: (pubkey: string) => string;
  onOpen: (streamId: string) => void;
  onClose: (streamId: string) => void;
}

/** Past this many, the chips stop and the full list takes over. */
const CHIPS = 3;

export function LiveTray({ streams, opened, nameFor, onOpen, onClose }: VoiceLive) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  if (streams.length === 0) return null;

  const toggle = (s: ActiveStream) => (opened.has(s.stream_id) ? onClose(s.stream_id) : onOpen(s.stream_id));
  const label = (s: ActiveStream) => s.kind === "webcam" ? t("voice.live.camera", { name: nameFor(s.sharer_pubkey) }) : nameFor(s.sharer_pubkey);
  const q = query.trim().toLowerCase();
  const listed = q ? streams.filter((s) => nameFor(s.sharer_pubkey).toLowerCase().includes(q)) : streams;
  // Opened lives keep their chip even past the limit, so one can always be closed.
  const chips = [...streams.filter((s) => opened.has(s.stream_id)), ...streams.filter((s) => !opened.has(s.stream_id))].slice(0, CHIPS);

  return (
    <div className="live-tray" role="group" aria-label={t("voice.live.label")}>
      <div className="live-tray-row">
        <span className="live-tray-dot" aria-hidden="true" />
        <span className="live-tray-title">{t("voice.live.title", { count: streams.length })}</span>
        {chips.map((s) => (
          <button
            key={s.stream_id}
            className={`live-chip${opened.has(s.stream_id) ? " open" : ""}`}
            aria-pressed={opened.has(s.stream_id)}
            title={opened.has(s.stream_id) ? t("voice.live.close") : t("voice.live.open")}
            onClick={() => toggle(s)}
          >
            <Avatar name={nameFor(s.sharer_pubkey)} pubkey={s.sharer_pubkey} size={22} />
            {label(s)}
          </button>
        ))}
        {streams.length > CHIPS && (
          <button className={`live-chip all${showAll ? " open" : ""}`} aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
            {t("voice.live.all")}
          </button>
        )}
      </div>
      {showAll && (
        <div className="live-tray-list" role="dialog" aria-label={t("voice.live.label")}>
          <label className="hub-drawer-search">
            <SearchIcon size={15} />
            <input
              type="search"
              autoFocus
              placeholder={t("voice.live.search_n", { count: streams.length })}
              aria-label={t("voice.live.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <ul>
            {listed.map((s) => (
              <li key={s.stream_id} className="live-tray-item">
                <Avatar name={nameFor(s.sharer_pubkey)} pubkey={s.sharer_pubkey} size={30} />
                <span className="live-tray-name">{label(s)}</span>
                <button className={`live-tray-toggle${opened.has(s.stream_id) ? " open" : ""}`} onClick={() => toggle(s)}>
                  {opened.has(s.stream_id) ? t("voice.live.stop_watching") : t("voice.live.watch")}
                </button>
              </li>
            ))}
          </ul>
          <p className="live-tray-note">{t("voice.live.note")}</p>
        </div>
      )}
    </div>
  );
}
