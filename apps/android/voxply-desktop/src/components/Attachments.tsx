import type { Attachment } from "../types";

export function PendingAttachments({
  items,
  onRemove,
}: {
  items: Attachment[];
  onRemove: (i: number) => void;
}) {
  return (
    <div className="pending-attachments">
      {items.map((a, i) => (
        <div key={a.name} className="pending-attachment">
          {a.mime.startsWith("image/") ? (
            <img
              src={`data:${a.mime};base64,${a.data_b64}`}
              alt={a.name}
              className="pending-attachment-thumb"
            />
          ) : (
            <span className="pending-attachment-file">📄 {a.name}</span>
          )}
          <button
            className="pending-attachment-remove"
            onClick={() => onRemove(i)}
            title="Remove"
            aria-label="Remove"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function MessageAttachments({
  items,
  onImageClick,
}: {
  items: Attachment[];
  onImageClick?: (url: string, alt: string) => void;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="message-attachments">
      {items.map((a) => {
        const url = `data:${a.mime};base64,${a.data_b64}`;
        if (a.mime.startsWith("image/")) {
          return (
            <button
              key={a.name}
              type="button"
              className="message-attachment-img-button"
              onClick={() => onImageClick?.(url, a.name)}
              title="Click to enlarge"
            >
              <img src={url} alt={a.name} className="message-attachment-img" />
            </button>
          );
        }
        return (
          <a
            key={a.name}
            href={url}
            download={a.name}
            className="message-attachment-file"
          >
            📄 {a.name}
          </a>
        );
      })}
    </div>
  );
}
