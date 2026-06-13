import { useState, useEffect } from "react";
import type { LinkPreview } from "../types";
import { fetchLinkPreview } from "@platform";
import { LinkPreviewCard } from "./LinkPreviewCard";

const URL_RE = /https?:\/\/[^\s<>"]+/;

interface Props {
  text: string;
  hubUrl: string;
  token: string;
}

export function LinkPreviewInMessage({ text, hubUrl, token }: Props) {
  const [preview, setPreview] = useState<LinkPreview | null>(null);

  const firstUrl = URL_RE.exec(text)?.[0] ?? null;

  useEffect(() => {
    if (!firstUrl || !hubUrl || !token) return;
    let cancelled = false;
    fetchLinkPreview(hubUrl, firstUrl, token)
      .then((p) => { if (!cancelled) setPreview(p); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [firstUrl, hubUrl, token]);

  if (!preview) return null;
  return <LinkPreviewCard preview={preview} />;
}
