import type { LinkPreview } from "../types";

interface Props {
  preview: LinkPreview;
}

export function LinkPreviewCard({ preview }: Props) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="link-preview-card"
    >
      {preview.image && (
        <img
          src={preview.image}
          alt=""
          className="link-preview-image"
          loading="lazy"
        />
      )}
      <div className="link-preview-body">
        <span className="link-preview-domain muted">{preview.domain}</span>
        {preview.title && (
          <span className="link-preview-title">{preview.title}</span>
        )}
        {preview.description && (
          <span className="link-preview-description muted">
            {preview.description}
          </span>
        )}
      </div>
    </a>
  );
}
