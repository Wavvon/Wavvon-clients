import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FocusTrap } from "./FocusTrap";

export function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="lightbox" onClick={onClose}>
      <FocusTrap>
        <img
          src={src}
          alt={alt}
          className="lightbox-img"
          onClick={(e) => e.stopPropagation()}
        />
        <button
          className="lightbox-close"
          onClick={onClose}
          title={t("lightbox.close_title")}
          aria-label={t("modal.close")}
        >
          ×
        </button>
      </FocusTrap>
    </div>
  );
}
