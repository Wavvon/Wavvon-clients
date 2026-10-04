import { useTranslation } from "react-i18next";

interface Props {
  onOpenSensitivity: () => void;
}

export function MicBelowGateWarning({ onOpenSensitivity }: Props) {
  const { t } = useTranslation();
  return (
    <div className="mic-gate-warning" role="alert">
      <span>{t("voice.mic_below_gate")}</span>
      <button type="button" className="mic-gate-warning-action" onClick={onOpenSensitivity}>
        {t("voice.mic_below_gate.action")}
      </button>
    </div>
  );
}
