import { useTranslation } from "react-i18next";
import type { VoiceParticipant } from "../../types";
import { Avatar } from "../Avatar";

/** The floor in a room with a talk-power threshold (the hub's `voice.hands`). */
export interface VoiceFloor {
  /** Who has a hand raised, oldest first. */
  hands: string[];
  /** Whether the relay carries what you send in this room. */
  maySpeak: boolean;
  /** You may give the floor or lower someone's hand (`moderation.mute`). */
  canGrant: boolean;
  onRaise: () => void;
  onLower: () => void;
  onGrant: (publicKey: string) => void;
  onDismiss: (publicKey: string) => void;
}

export interface VoiceStageInfo {
  participants: VoiceParticipant[];
  /** Pubkeys speaking right now (yours included). */
  speaking: Set<string>;
  /** Member avatars by pubkey; a visitor from an allied hub has none. */
  avatars: Map<string, string | null>;
  /** You are already in this room. */
  inThisRoom: boolean;
  onJoin: () => void;
  /** Your own pubkey, to find your raised hand. */
  publicKey?: string | null;
  /** Absent on a hub without `voice.hands`, and when you are not in the room. */
  floor?: VoiceFloor;
}

// A voice channel opens to its room: who is in it, who is talking, and the
// way in, above the channel's own chat. Opening it does not join; a double
// click in the sidebar or the button here does.
export function VoiceStage({ participants, speaking, avatars, inThisRoom, onJoin, publicKey, floor }: VoiceStageInfo) {
  const { t } = useTranslation();
  const myHandUp = !!floor && !!publicKey && floor.hands.includes(publicKey);
  return (
    <section className="voice-stage" aria-label={t("voice.stage.label")}>
      {participants.length === 0 ? (
        <p className="muted">{t("voice.stage.empty")}</p>
      ) : (
        <ul className="voice-stage-tiles">
          {participants.map((p) => {
            const name = p.display_name || p.public_key.slice(0, 12);
            const handUp = !!floor?.hands.includes(p.public_key);
            return (
              <li key={p.public_key} className={`voice-stage-tile${speaking.has(p.public_key) ? " speaking" : ""}`} title={p.public_key}>
                <Avatar src={avatars.get(p.public_key)} name={name} pubkey={p.public_key} size={64} />
                <span className="voice-stage-name">
                  {handUp && <span className="voice-stage-hand" role="img" aria-label={t("voice.stage.hand_raised")}>✋ </span>}
                  {name}
                </span>
                {handUp && floor?.canGrant && p.public_key !== publicKey && (
                  <span className="voice-stage-floor-actions">
                    <button className="btn-small" onClick={() => floor.onGrant(p.public_key)}>{t("voice.stage.grant")}</button>
                    <button className="btn-small btn-secondary" onClick={() => floor.onDismiss(p.public_key)}>{t("voice.stage.dismiss")}</button>
                  </span>
                )}
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
      {inThisRoom && floor && !floor.maySpeak && (
        <div className="settings-row" style={{ gap: "var(--space-2)" }}>
          <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
            {myHandUp ? t("voice.stage.waiting") : t("voice.stage.listening")}
          </span>
          {myHandUp ? (
            <button className="btn-secondary" onClick={floor.onLower}>{t("voice.stage.lower_hand")}</button>
          ) : (
            <button className="btn-primary" onClick={floor.onRaise}>{t("voice.stage.raise_hand")}</button>
          )}
        </div>
      )}
    </section>
  );
}
