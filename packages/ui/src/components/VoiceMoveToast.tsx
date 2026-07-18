import React from "react";
import { useTranslation } from "react-i18next";

interface Props {
  channelName: string;
  /** Whether a source channel is known — no source (e.g. wasn't in voice) means no escape hatch. */
  canRejoin: boolean;
  onRejoin: () => void;
  onDismiss: () => void;
}

/** Self-dismissing notice for an auto-accepted voice move (events.md §7.2)
 *  — a slot claimant is moved without a blocking prompt, but keeps a
 *  one-click way back in case of misplacement. */
export function VoiceMoveToast({ channelName, canRejoin, onRejoin, onDismiss }: Props) {
  const { t } = useTranslation();
  return (
    <div className="voice-move-toast" role="status">
      <div className="voice-move-toast-header">
        <span>{t("voice.move.toast", { channel: channelName })}</span>
        <button className="btn-ghost" onClick={onDismiss} aria-label={t("voice.move.toast.dismiss")}>×</button>
      </div>
      {canRejoin && (
        <div className="voice-move-toast-actions">
          <button className="btn-small" onClick={onRejoin}>{t("voice.move.toast.rejoin")}</button>
        </div>
      )}
    </div>
  );
}
