import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FocusTrap } from "../FocusTrap";
import { useCloseOnEscape } from "../../hooks/useCloseOnEscape";

/** `datetime-local` wants local time without a zone. */
function toLocalInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

/** "Remind me at a chosen time". */
export function RemindAtModal({ onPick, onClose }: { onPick: (at: number) => void; onClose: () => void }) {
  const { t } = useTranslation();
  useCloseOnEscape(onClose);
  const [value, setValue] = useState(() => toLocalInput(Date.now() + 60 * 60_000));
  const at = new Date(value).getTime();
  const valid = Number.isFinite(at) && at > Date.now();
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={t("remind.custom_title")}>
      <FocusTrap>
        <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
          <h2>{t("remind.custom_title")}</h2>
          <input
            type="datetime-local"
            value={value}
            min={toLocalInput(Date.now())}
            onChange={(e) => setValue(e.target.value)}
            aria-label={t("remind.custom_title")}
            autoFocus
          />
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>{t("modal.cancel")}</button>
            <button className="btn-primary" disabled={!valid} onClick={() => { onClose(); onPick(at); }}>
              {t("remind.set")}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
