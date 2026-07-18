import React from "react";
import { useTranslation } from "react-i18next";
import { FocusTrap } from "./FocusTrap";

interface Props {
  channelName: string;
  onAccept: () => void;
  onDecline: () => void;
}

/** Blocking accept/decline prompt for a voice move with no event context
 *  (events.md §7.2 Phase-1 right-click primitive). Decline is a server
 *  no-op — closing the modal is enough, nothing to send. */
export function VoiceMovePromptModal({ channelName, onAccept, onDecline }: Props) {
  const { t } = useTranslation();
  return (
    <div className="modal-overlay" onClick={onDecline} role="dialog" aria-modal="true" aria-label={t("voice.move.prompt.title")}>
      <FocusTrap>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>{t("voice.move.prompt.title")}</h3>
          <p>{t("voice.move.prompt.body", { channel: channelName })}</p>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onDecline}>{t("voice.move.prompt.decline")}</button>
            <button className="btn-primary" onClick={onAccept}>{t("voice.move.prompt.accept")}</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
