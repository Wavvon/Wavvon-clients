import { useTranslation } from "react-i18next";
import type { PendingFilesState } from "../hooks/usePendingFiles";
import { CloseIcon } from "./Icons";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export function PendingFiles({ state }: { state: PendingFilesState }) {
  const { t } = useTranslation();
  return (
    <div className="pending-attachments">
      {state.files.map((f, i) => {
        const isImage = IMAGE_TYPES.has(f.file.type);
        return (
          <div key={f.objectUrl} className="pending-attachment">
            {isImage ? (
              <img src={f.objectUrl} alt={f.file.name} className="pending-attachment-thumb" />
            ) : (
              <span className="pending-attachment-file">📄 {f.file.name}</span>
            )}
            {isImage && (
              <label className="muted" title={t("attachment.as_file_notice")}>
                <input type="checkbox" checked={f.asFile} onChange={() => state.toggleAsFile(i)} />{" "}
                {t("attachment.as_file")}
              </label>
            )}
            {isImage && f.asFile && <span className="muted">{t("attachment.as_file_notice")}</span>}
            <button
              type="button"
              className="pending-attachment-remove"
              onClick={() => state.remove(i)}
              title={t("attachment.remove")}
              aria-label={t("attachment.remove")}
            >
              <CloseIcon size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
