import type { Channel } from "@wavvon/core";
import { useTranslation } from "react-i18next";
import type { HubStreamInfo } from "../types";
import { FocusTrap } from "./FocusTrap";

interface Props {
  streams: HubStreamInfo[];
  subscribedIds: Set<string>;
  currentChannelId: string | null;
  channels: Channel[];
  nameFor: (pubkey: string) => string;
  onWatch: (channelId: string, streamId: string) => void;
  onStopWatch: (channelId: string, streamId: string) => void;
  onClose: () => void;
}

// Cross-channel screen-share discovery: watch a share happening in another
// channel without joining it.
export function HubStreamsPanel({ streams, subscribedIds, currentChannelId, channels, nameFor, onWatch, onStopWatch, onClose }: Props) {
  const { t } = useTranslation();
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id.slice(0, 8);
  // Only screen shares in OTHER channels are worth surfacing here.
  const others = streams.filter((s) => s.kind === "screen" && s.channel_id !== currentChannelId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="hub-streams-title" onClick={(e) => e.stopPropagation()}>
          <h3 id="hub-streams-title">{t("voice.streams.title")}</h3>
          <p className="muted">{t("voice.streams.hint")}</p>

          {others.length === 0 ? (
            <p className="muted">{t("voice.streams.empty")}</p>
          ) : (
            others.map((s) => {
              const watching = subscribedIds.has(s.stream_id);
              return (
                <div key={s.stream_id} className="settings-row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                  <span>
                    🖥 <strong>{nameFor(s.sharer_pubkey)}</strong>
                    <span className="muted" style={{ fontSize: "var(--text-xs)" }}> in #{channelName(s.channel_id)}</span>
                  </span>
                  {watching ? (
                    <button className="btn-small btn-secondary" onClick={() => onStopWatch(s.channel_id, s.stream_id)}>{t("voice.streams.stop_watching")}</button>
                  ) : (
                    <button className="btn-small" onClick={() => onWatch(s.channel_id, s.stream_id)}>{t("voice.streams.watch")}</button>
                  )}
                </div>
              );
            })
          )}

          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>{t("modal.close")}</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
