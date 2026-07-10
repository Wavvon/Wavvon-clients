import { useRef, useState } from "react";
import { forumCreatePost } from "../../platform/commands/forum";

interface Props {
  channelId: string;
  onCreated: (postId: string) => void;
  onCancel: () => void;
}

interface PendingFile {
  file: File;
  objectUrl: string;
}

export function ForumComposer({ channelId, onCreated, onCancel }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (!picked.length) return;
    const next = picked.map((f) => ({ file: f, objectUrl: URL.createObjectURL(f) }));
    setPendingFiles((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(objectUrl: string) {
    setPendingFiles((prev) => {
      const removed = prev.find((f) => f.objectUrl === objectUrl);
      if (removed) URL.revokeObjectURL(removed.objectUrl);
      return prev.filter((f) => f.objectUrl !== objectUrl);
    });
  }

  async function handleSubmit() {
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      // TODO: upload before submit
      const result = await forumCreatePost(channelId, title.trim(), body.trim());
      pendingFiles.forEach((f) => URL.revokeObjectURL(f.objectUrl));
      onCreated(result.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="forum-composer">
      <h2>New post</h2>
      <div className="settings-section">
        <label className="settings-label" htmlFor="forum-title">Title</label>
        <input
          id="forum-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Post title"
          maxLength={200}
          style={{ width: "100%" }}
        />
      </div>
      <div className="settings-section">
        <label className="settings-label" htmlFor="forum-body">Body</label>
        <textarea
          id="forum-body"
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your post…"
          style={{ width: "100%" }}
        />
      </div>
      <div className="settings-section">
        <label className="settings-label">Attachments</label>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <button
          type="button"
          className="btn-secondary"
          onClick={() => fileInputRef.current?.click()}
        >
          Attach file
        </button>
        {pendingFiles.length > 0 && (
          <ul className="forum-pending-attachments">
            {pendingFiles.map((f) => (
              <li key={f.objectUrl} className="forum-pending-attachment-row">
                <span>{f.file.name}</span>
                <button
                  type="button"
                  className="btn-ghost danger"
                  onClick={() => removeFile(f.objectUrl)}
                  aria-label={`Remove ${f.file.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="settings-row" style={{ gap: 8 }}>
        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={!title.trim() || !body.trim() || submitting}
        >
          {submitting ? "Posting…" : "Post"}
        </button>
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
