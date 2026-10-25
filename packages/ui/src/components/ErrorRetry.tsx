import { useTranslation } from "react-i18next";
interface Props {
  message: string;
  onRetry: () => void;
}

// Plain English (not t()) to match the other admin-section controls that
// skip the 4-locale translation catalog for newer, narrowly-scoped strings.
export function ErrorRetry({ message, onRetry }: Props) {
  const { t } = useTranslation();
  return (
    <div className="error-retry">
      <p className="error-text">{message}</p>
      <button className="btn-secondary" onClick={onRetry}>{t("modal.retry")}</button>
    </div>
  );
}
