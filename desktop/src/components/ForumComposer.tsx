import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PostSummary } from "../types";

interface Props {
  channelId: string;
  activeHubUrl: string;
  onCreated: (post: PostSummary) => void;
  onCancel: () => void;
}

export function ForumComposer({ channelId, activeHubUrl, onCreated, onCancel }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      setError("Title and body are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const post = await invoke<PostSummary>("forum_create_post", {
        hubUrl: activeHubUrl,
        channelId,
        title: t,
        body: b,
      });
      onCreated(post);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="forum-composer">
      <h3 className="forum-composer-title">New post</h3>
      <div className="settings-section">
        <label className="settings-label">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Post title"
          maxLength={200}
          disabled={submitting}
          autoFocus
        />
      </div>
      <div className="settings-section">
        <label className="settings-label">Body</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your post…"
          rows={8}
          disabled={submitting}
        />
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="forum-composer-actions">
        <button onClick={handleSubmit} disabled={submitting || !title.trim() || !body.trim()}>
          {submitting ? "Posting…" : "Post"}
        </button>
        <button className="btn-secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </div>
  );
}
