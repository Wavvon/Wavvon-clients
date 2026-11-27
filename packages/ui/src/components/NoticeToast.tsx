import { useTranslation } from "react-i18next";
import type { Notice } from "../hooks/useNoticeToast";

interface Props {
  notice: Notice;
  onDismiss: () => void;
}

export function NoticeToast({ notice, onDismiss }: Props) {
  const { t } = useTranslation();
  return (
    <div className="notice-toast" role="status">
      <span>{notice.message}</span>
      {notice.undo && (
        <button
          className="btn-small"
          onClick={() => { notice.undo!(); onDismiss(); }}
        >
          {t("toast.undo")}
        </button>
      )}
    </div>
  );
}
