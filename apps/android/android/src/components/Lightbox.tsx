import { useEffect } from "react";
import { FocusTrap } from "@voxply/ui";

export function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
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
          title="Close (Esc)"
          aria-label="Close"
        >
          ×
        </button>
      </FocusTrap>
    </div>
  );
}
