import { useTranslation } from "react-i18next";
import type { AttachmentRef } from "../types";
import { needsDownloadWarning, sameOriginAttachmentUrl } from "../utils/attachments";
import { useConfirm } from "./ConfirmDialog";

export function StoredAttachment({
  a,
  hubUrl,
  onImageClick,
}: {
  a: AttachmentRef;
  hubUrl: string;
  onImageClick?: (url: string, alt: string) => void;
}) {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  if (a.state === "removed") {
    return <span className="message-attachment-file muted">{t("attachment.removed", { name: a.name })}</span>;
  }
  if (a.state === "expired") {
    return <span className="message-attachment-file muted">{t("attachment.expired", { name: a.name })}</span>;
  }
  // The hub names the path; it must not name the host. A url like
  // "@evil.example/x" glued onto the hub address used to send the click (and
  // on desktop the whole window) to a page the hub chose.
  const url = sameOriginAttachmentUrl(hubUrl, a.url);
  if (!url) {
    return <span className="message-attachment-file muted">{t("attachment.removed", { name: a.name })}</span>;
  }
  if (a.kind === "image") {
    return (
      <button
        type="button"
        className="message-attachment-img-button"
        onClick={() => onImageClick?.(url, a.name)}
        title={t("attachment.enlarge")}
      >
        <img
          src={url}
          alt={a.name}
          width={a.width ?? undefined}
          height={a.height ?? undefined}
          className="message-attachment-img"
        />
      </button>
    );
  }
  return (
    <>
      <a
        href={url}
        download={a.name}
        target="_blank"
        rel="noopener noreferrer"
        className="message-attachment-file"
        onClick={async (e) => {
          if (!needsDownloadWarning(a.name)) return;
          e.preventDefault();
          const ok = await confirm({
            title: t("attachment.download_title", { name: a.name }),
            body: t("attachment.download_warning"),
            confirmLabel: t("attachment.download_confirm"),
            danger: true,
          });
          if (!ok) return;
          const link = document.createElement("a");
          link.href = url;
          link.download = a.name;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.click();
        }}
      >
        📄 {a.name}
      </a>
      {dialog}
    </>
  );
}
