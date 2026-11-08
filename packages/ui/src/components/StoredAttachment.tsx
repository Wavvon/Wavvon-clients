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
  return <DownloadLink href={url} name={a.name} newTab />;
}

/** A file link that asks before saving a type that can run on open. Shared by
 *  stored attachments and the inline ones of an encrypted DM, whose name and
 *  bytes are both the sender's choice. */
export function DownloadLink({ href, name, newTab }: { href: string; name: string; newTab?: boolean }) {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  const target = newTab ? "_blank" : undefined;
  return (
    <>
      <a
        href={href}
        download={name}
        target={target}
        rel="noopener noreferrer"
        className="message-attachment-file"
        onClick={async (e) => {
          if (!needsDownloadWarning(name)) return;
          e.preventDefault();
          const ok = await confirm({
            title: t("attachment.download_title", { name }),
            body: t("attachment.download_warning"),
            confirmLabel: t("attachment.download_confirm"),
            danger: true,
          });
          if (!ok) return;
          const link = document.createElement("a");
          link.href = href;
          link.download = name;
          if (target) link.target = target;
          link.rel = "noopener noreferrer";
          link.click();
        }}
      >
        📄 {name}
      </a>
      {dialog}
    </>
  );
}
