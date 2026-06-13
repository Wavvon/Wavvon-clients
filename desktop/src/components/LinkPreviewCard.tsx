import React from "react";
import type { LinkPreview } from "../types";

function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function LinkPreviewCard({ preview }: { preview: LinkPreview }) {
  return (
    <div className="link-preview-card">
      {preview.image_url && (
        <img
          className="link-preview-image"
          src={preview.image_url}
          alt=""
          loading="lazy"
        />
      )}
      <div className="link-preview-body">
        {preview.title && (
          <div className="link-preview-title">{preview.title}</div>
        )}
        {preview.description && (
          <div className="link-preview-desc">{preview.description}</div>
        )}
        <a
          className="link-preview-domain muted"
          href={preview.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {domainOf(preview.url)}
        </a>
      </div>
    </div>
  );
}
