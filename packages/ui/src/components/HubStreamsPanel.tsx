import type { Channel } from "@wavvon/core";
import { useTranslation } from "react-i18next";
import type { HubStreamInfo } from "../types";
import { FocusTrap } from "./FocusTrap";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";

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

/** The screen shares live on the hub right now. Cameras are shared with their
 *  voice room only, never with the hub, so they are not counted. */
export function liveScreenShares(streams: HubStreamInfo[]): HubStreamInfo[] {
  return streams.filter((s) => s.kind === "screen");
}

/** Who has a camera on, for the sidebar roster. */
export function camerasOn(streams: HubStreamInfo[]): Set<string> {
  return new Set(streams.filter((s) => s.kind === "webcam").map((s) => s.sharer_pubkey));
}

// What is live across the hub, one heading per voice channel in sidebar
// order, the channel you are in included: watch a share without joining.
export function HubStreamsPanel({ streams, subscribedIds, currentChannelId, channels, nameFor, onWatch, onStopWatch, onClose }: Props) {
  useCloseOnEscape(onClose);
  const { t } = useTranslation();
  const shares = liveScreenShares(streams);
  const order = (id: string) => {
    const i = channels.findIndex((c) => c.id === id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const groups = [...new Set(shares.map((s) => s.channel_id))]
    .sort((a, b) => order(a) - order(b))
    .map((channelId) => ({
      channelId,
      name: channels.find((c) => c.id === channelId)?.name ?? channelId.slice(0, 8),
      shares: shares.filter((s) => s.channel_id === channelId),
    }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="hub-streams-title" onClick={(e) => e.stopPropagation()}>
          <h3 id="hub-streams-title">{t("voice.streams.title")}</h3>
          <p className="muted">{t("voice.streams.hint")}</p>

          {groups.length === 0 ? (
            <p className="muted">{t("voice.streams.empty")}</p>
          ) : (
            groups.map((g) => (
              <section key={g.channelId} aria-label={g.name}>
                <h4 style={{ margin: "12px 0 4px" }}>
                  #{g.name}
                  {g.channelId === currentChannelId && (
                    <span className="muted" style={{ fontSize: "var(--text-xs)", fontWeight: "normal" }}> {t("voice.streams.this_channel")}</span>
                  )}
                </h4>
                {g.shares.map((s) => {
                  const watching = subscribedIds.has(s.stream_id);
                  return (
                    <div key={s.stream_id} className="settings-row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                      <span>
                        🖥 <strong>{nameFor(s.sharer_pubkey)}</strong>
                      </span>
                      {watching ? (
                        <button className="btn-small btn-secondary" onClick={() => onStopWatch(s.channel_id, s.stream_id)}>{t("voice.streams.stop_watching")}</button>
                      ) : (
                        <button className="btn-small" onClick={() => onWatch(s.channel_id, s.stream_id)}>{t("voice.streams.watch")}</button>
                      )}
                    </div>
                  );
                })}
              </section>
            ))
          )}

          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>{t("modal.close")}</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
