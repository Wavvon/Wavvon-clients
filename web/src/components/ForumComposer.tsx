import { useState } from "react";
import { forumCreatePost } from "../platform/commands/forum";

interface Props {
  channelId: string;
  onCreated: (postId: string) => void;
  onCancel: () => void;
}

export function ForumComposer({ channelId, onCreated, onCancel }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await forumCreatePost(channelId, title.trim(), body.trim());
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
