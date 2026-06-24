import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PostDetail, ReplyView } from "../types";
import { formatRelative } from "@voxply/core";

interface Props {
  postId: string;
  channelId: string;
  hubUrl: string;
  publicKey: string | null;
  canManagePosts: boolean;
  onBack: () => void;
}

export function ForumPostDetail({ postId, channelId, hubUrl, publicKey, canManagePosts, onBack }: Props) {
  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadPost();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, hubUrl, channelId]);

  async function loadPost() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${hubUrl}/posts/${postId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PostDetail = await res.json();
      setPost(data);
      // Fire-and-forget: mark this post as read.
      void invoke("mark_post_read", { channelId, postId }).catch(() => undefined);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function submitReply() {
    if (!replyBody.trim() || !post) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { body: replyBody.trim() };
      if (replyTo) body.reply_to_id = replyTo;
      const res = await fetch(`${hubUrl}/posts/${postId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReplyBody("");
      setReplyTo(null);
      await loadPost();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteReply(replyId: string) {
    try {
      await fetch(`${hubUrl}/replies/${replyId}`, { method: "DELETE" });
      await loadPost();
    } catch (e) {
      setError(String(e));
    }
  }

  async function deletePost() {
    try {
      await fetch(`${hubUrl}/posts/${postId}`, { method: "DELETE" });
      onBack();
    } catch (e) {
      setError(String(e));
    }
  }

  async function togglePin() {
    if (!post) return;
    const method = post.is_pinned ? "DELETE" : "POST";
    try {
      await fetch(`${hubUrl}/posts/${postId}/pin`, { method });
      await loadPost();
    } catch (e) {
      setError(String(e));
    }
  }

  async function toggleLock() {
    if (!post) return;
    const method = post.is_locked ? "DELETE" : "POST";
    try {
      await fetch(`${hubUrl}/posts/${postId}/lock`, { method });
      await loadPost();
    } catch (e) {
      setError(String(e));
    }
  }

  if (loading) return <div className="forum-detail-loading muted">Loading…</div>;
  if (error) return <div className="error-text">{error}</div>;
  if (!post) return null;

  const isAuthor = post.author_pubkey === publicKey;

  return (
    <div className="forum-post-detail">
      <button className="forum-back-btn" onClick={onBack}>← Back to posts</button>
      <div className="forum-post-header">
        <h2 className="forum-post-detail-title">
          {post.is_pinned && <span className="forum-badge pin-badge">📌</span>}
          {post.is_locked && <span className="forum-badge lock-badge">🔒</span>}
          {post.title}
        </h2>
        <div className="forum-post-detail-meta muted">
          <span>{formatRelative(post.created_at)}</span>
          {post.edited_at && <span>(edited)</span>}
        </div>
        {canManagePosts && (
          <div className="forum-mod-actions">
            <button className="btn-secondary" onClick={togglePin}>
              {post.is_pinned ? "Unpin" : "Pin"}
            </button>
            <button className="btn-secondary" onClick={toggleLock}>
              {post.is_locked ? "Unlock" : "Lock"}
            </button>
          </div>
        )}
        {(isAuthor || canManagePosts) && (
          <button className="btn-danger forum-delete-post" onClick={deletePost}>Delete post</button>
        )}
      </div>
      <div className="forum-post-body">{post.body}</div>

      <section className="forum-replies">
        <h3 className="forum-section-label">{post.reply_count} {post.reply_count === 1 ? "Reply" : "Replies"}</h3>
        {post.replies.map((r) => (
          <ReplyRow
            key={r.id}
            reply={r}
            publicKey={publicKey}
            canManage={canManagePosts}
            onReplyTo={() => setReplyTo(r.id)}
            onDelete={() => deleteReply(r.id)}
          />
        ))}
      </section>

      {!post.is_locked && (
        <div className="forum-reply-composer">
          {replyTo && (
            <div className="forum-reply-quote muted">
              Replying to a message
              <button className="forum-clear-reply" onClick={() => setReplyTo(null)} aria-label="Clear reply" title="Clear reply">×</button>
            </div>
          )}
          <textarea
            className="forum-reply-input"
            rows={3}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Write a reply…"
          />
          <button
            className="btn-primary"
            onClick={submitReply}
            disabled={submitting || !replyBody.trim()}
          >
            {submitting ? "Posting…" : "Post reply"}
          </button>
        </div>
      )}
      {post.is_locked && (
        <p className="forum-locked-banner muted">🔒 This post is locked. No new replies.</p>
      )}
    </div>
  );
}

function ReplyRow({
  reply,
  publicKey,
  canManage,
  onReplyTo,
  onDelete,
}: {
  reply: ReplyView;
  publicKey: string | null;
  canManage: boolean;
  onReplyTo: () => void;
  onDelete: () => void;
}) {
  if (reply.is_deleted) {
    return <div className="forum-reply forum-reply-deleted muted">[deleted]</div>;
  }
  const isAuthor = reply.author_pubkey === publicKey;
  return (
    <div className="forum-reply">
      <div className="forum-reply-meta muted">
        <span>{reply.author_pubkey.slice(0, 12)}</span>
        <span>{formatRelative(reply.created_at)}</span>
        {reply.edited_at && <span>(edited)</span>}
      </div>
      <div className="forum-reply-body">{reply.body}</div>
      <div className="forum-reply-actions">
        <button className="btn-link" onClick={onReplyTo}>Reply</button>
        {(isAuthor || canManage) && (
          <button className="btn-link danger" onClick={onDelete}>Delete</button>
        )}
      </div>
    </div>
  );
}
