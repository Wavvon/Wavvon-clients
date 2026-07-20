import { useState, useEffect } from "react";
import type { LinkPreview } from "../../types";
import { LinkPreviewCard } from "./LinkPreviewCard";

interface Props {
  text: string;
  hubUrl: string;
  token?: string | null;
  fetchLinkPreview: (hubUrl: string, url: string, token?: string | null) => Promise<LinkPreview>;
}

const URL_RE = /https?:\/\/[^\s<>"]+/;

export function LinkPreviewInMessage({ text, hubUrl, token, fetchLinkPreview }: Props) {
  const [preview, setPreview] = useState<LinkPreview | null>(null);

  const firstUrl = URL_RE.exec(text)?.[0] ?? null;

  useEffect(() => {
    if (!firstUrl || !hubUrl) return;
    let cancelled = false;
    fetchLinkPreview(hubUrl, firstUrl, token)
      .then((p) => { if (!cancelled) setPreview(p); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [firstUrl, hubUrl, token, fetchLinkPreview]);

  if (!preview) return null;
  return <LinkPreviewCard preview={preview} />;
}
