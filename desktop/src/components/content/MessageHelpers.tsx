import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { LinkPreview } from "../../types";
import { LinkPreviewCard } from "../LinkPreviewCard";

export const URL_RE = /https?:\/\/\S+/;

export function IgnoredMessagePlaceholder() {
  const { t } = useTranslation();
  const [revealed, setRevealed] = React.useState(false);
  return (
    <li className="message message-row message-ignored-placeholder">
      {revealed ? null : (
        <button
          className="btn-link muted"
          style={{ fontSize: "var(--text-xs)" }}
          onClick={() => setRevealed(true)}
        >
          {t("message.ignored_placeholder")}
        </button>
      )}
    </li>
  );
}

export function MessageLinkPreview({
  content,
  activeHubUrl,
}: {
  content: string;
  activeHubUrl: string;
}) {
  const [preview, setPreview] = React.useState<LinkPreview | null>(null);
  const fetchedRef = React.useRef(false);

  React.useEffect(() => {
    if (fetchedRef.current || !activeHubUrl) return;
    const m = URL_RE.exec(content);
    if (!m) return;
    fetchedRef.current = true;
    invoke<LinkPreview>("fetch_link_preview", { hubUrl: activeHubUrl, url: m[0] })
      .then(setPreview)
      .catch(() => {});
  }, [content, activeHubUrl]);

  if (!preview) return null;
  return <LinkPreviewCard preview={preview} />;
}
