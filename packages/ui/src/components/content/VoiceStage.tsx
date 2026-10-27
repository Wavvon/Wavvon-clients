import { useTranslation } from "react-i18next";
import type { VoiceParticipant } from "../../types";
import { Avatar } from "../Avatar";

export interface VoiceStageInfo {
  participants: VoiceParticipant[];
  /** Pubkeys speaking right now (yours included). */
  speaking: Set<string>;
  /** Member avatars by pubkey; a visitor from an allied hub has none. */
  avatars: Map<string, string | null>;
  /** You are already in this room. */
  inThisRoom: boolean;
  onJoin: () => void;
}

// A voice channel opens to its room: who is in it, who is talking, and the
// way in, above the channel's own chat. Opening it does not join; a double
// click in the sidebar or the button here does.
export function VoiceStage({ participants, speaking, avatars, inThisRoom, onJoin }: VoiceStageInfo) {
  const { t } = useTranslation();
  return (
    <section className="voice-stage" aria-label={t("voice.stage.label")}>
      {participants.length === 0 ? (
        <p className="muted">{t("voice.stage.empty")}</p>
      ) : (
        <ul className="voice-stage-tiles">
          {participants.map((p) => {
            const name = p.display_name || p.public_key.slice(0, 12);
            return (
              <li key={p.public_key} className={`voice-stage-tile${speaking.has(p.public_key) ? " speaking" : ""}`} title={p.public_key}>
                <Avatar src={avatars.get(p.public_key)} name={name} pubkey={p.public_key} size={64} />
                <span className="voice-stage-name">{name}</span>
              </li>
            );
          })}
        </ul>
      )}
      {!inThisRoom && (
        <div className="settings-row" style={{ gap: "var(--space-2)" }}>
          <button className="btn-primary" onClick={onJoin}>{t("voice.stage.join")}</button>
          <span className="muted" style={{ fontSize: "var(--text-xs)" }}>{t("voice.stage.join_hint")}</span>
        </div>
      )}
    </section>
  );
}
