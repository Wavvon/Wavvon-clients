import React, { useState } from "react";

interface Props {
  channelId: string;
  hubUrl: string;
  onCreated: () => void;
  onCancel: () => void;
}

export function ForumComposer({ channelId, hubUrl, onCreated, onCancel }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${hubUrl}/channels/${channelId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onCreated();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="forum-composer modal-overlay" onClick={onCancel}>
      <div className="modal forum-composer-modal" onClick={(e) => e.stopPropagation()}>
        <h2>New post</h2>
        {error && <p className="error-text">{error}</p>}
        <form onSubmit={handleSubmit}>
          <div className="settings-section">
            <label className="settings-label" htmlFor="forum-title">Title</label>
            <input
              id="forum-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Post title"
              autoFocus
            />
          </div>
          <div className="settings-section">
            <label className="settings-label" htmlFor="forum-body">Body</label>
            <textarea
              id="forum-body"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What do you want to discuss?"
            />
          </div>
          <div className="forum-composer-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting || !title.trim() || !body.trim()}>
              {submitting ? "Posting…" : "Post"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
