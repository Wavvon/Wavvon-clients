import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PostDetail, ReplyView, PostSummary, User } from "../types";
import { formatRelative } from "../utils/format";

interface Props {
  postSummary: PostSummary;
  channelId: string;
  activeHubUrl: string;
  users: User[];
  myPubkey: string | null;
  myRoles: { permissions: string[] }[];
  onBack: () => void;
  onPostUpdated: (post: PostSummary) => void;
}

export function ForumPostDetail({
  postSummary, channelId, activeHubUrl, users, myPubkey, myRoles, onBack, onPostUpdated,
}: Props) {
  const [detail, setDetail] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [replyCursor, setReplyCursor] = useState<string | null>(null);

  const canReply = !postSummary.is_locked &&
    myRoles.some((r) => r.permissions.includes("send_messages") || r.permissions.includes("admin"));
  const canManage = myRoles.some((r) => r.permissions.includes("manage_posts") || r.permissions.includes("admin"));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await invoke<PostDetail>("forum_get_post", {
        hubUrl: activeHubUrl,
        postId: postSummary.id,
      });
      setDetail(d);
      setReplyCursor(d.reply_cursor ?? null);
      // Fire-and-forget: mark this post as read.
      void invoke("mark_post_read", {
        channelId: channelId,
        postId: postSummary.id,
      }).catch(() => undefined);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [activeHubUrl, channelId, postSummary.id]);

  useEffect(() => { load(); }, [load]);

  function displayName(pubkey: string) {
    return users.find((u) => u.public_key === pubkey)?.display_name || pubkey.slice(0, 12);
  }

  async function handleSendReply() {
    const b = replyBody.trim();
    if (!b) return;
    setSubmitting(true);
    try {
      const reply = await invoke<ReplyView>("forum_create_reply", {
        hubUrl: activeHubUrl,
        postId: postSummary.id,
        body: b,
        replyToId: replyTo,
      });
      setDetail((prev) => prev ? { ...prev, replies: [...prev.replies, reply], reply_count: (prev.reply_count ?? 0) + 1 } : prev);
      setReplyBody("");
      setReplyTo(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePin() {
    if (!detail) return;
    try {
      if (detail.is_pinned) {
        await invoke("forum_pin_post", { hubUrl: activeHubUrl, postId: detail.id, pin: false });
      } else {
        await invoke("forum_pin_post", { hubUrl: activeHubUrl, postId: detail.id, pin: true });
      }
      const updated = { ...postSummary, is_pinned: !detail.is_pinned };
      setDetail((d) => d ? { ...d, is_pinned: !d.is_pinned } : d);
      onPostUpdated(updated);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleLock() {
    if (!detail) return;
    try {
      await invoke("forum_lock_post", { hubUrl: activeHubUrl, postId: detail.id, lock: !detail.is_locked });
      const updated = { ...postSummary, is_locked: !detail.is_locked };
      setDetail((d) => d ? { ...d, is_locked: !d.is_locked } : d);
      onPostUpdated(updated);
    } catch (e) {
      setError(String(e));
    }
  }

  async function loadMoreReplies() {
    if (!replyCursor || !detail) return;
    try {
      const result = await invoke<{ replies: ReplyView[]; cursor: string | null }>("forum_get_post_replies", {
        hubUrl: activeHubUrl,
        postId: detail.id,
        cursor: replyCursor,
      });
      setDetail((d) => d ? { ...d, replies: [...d.replies, ...result.replies] } : d);
      setReplyCursor(result.cursor ?? null);
    } catch (e) {
      setError(String(e));
    }
  }

  function renderReply(reply: ReplyView) {
    if (reply.is_deleted) {
      return (
        <div key={reply.id} className="forum-reply forum-reply-deleted">
          <span className="muted">[deleted]</span>
        </div>
      );
    }
    const quotedReply = reply.reply_to_id
      ? detail?.replies.find((r) => r.id === reply.reply_to_id)
      : null;
    return (
      <div key={reply.id} className="forum-reply">
        {quotedReply && !quotedReply.is_deleted && (
          <div className="forum-reply-quote muted">
            <span className="forum-reply-quote-author">{displayName(quotedReply.author_pubkey)}:</span>{" "}
            {quotedReply.body.slice(0, 120)}{quotedReply.body.length > 120 ? "…" : ""}
          </div>
        )}
        <div className="forum-reply-header">
          <span className="forum-reply-author" style={{ fontWeight: 600 }}>{displayName(reply.author_pubkey)}</span>
          <span className="forum-reply-time muted">{formatRelative(reply.created_at)}</span>
          {reply.edited_at && <span className="forum-reply-edited muted">(edited)</span>}
        </div>
        <p className="forum-reply-body">{reply.body}</p>
        {canReply && (
          <button
            className="btn-secondary forum-reply-btn"
            onClick={() => setReplyTo(replyTo === reply.id ? null : reply.id)}
          >
            {replyTo === reply.id ? "Cancel reply" : "Reply"}
          </button>
        )}
      </div>
    );
  }

  if (loading) return <div className="forum-detail-loading muted">Loading post…</div>;
  if (error) return <div className="error-text">{error}</div>;
  if (!detail) return null;

  return (
    <div className="forum-post-detail">
      <div className="forum-detail-nav">
        <button className="btn-secondary" onClick={onBack}>← Back to posts</button>
      </div>

      <article className="forum-post-article">
        <header className="forum-post-header">
          <h2 className="forum-post-detail-title">
            {detail.is_pinned && <span className="forum-pin-icon" title="Pinned">📌</span>}
            {detail.is_locked && <span className="forum-lock-icon" title="Locked">🔒</span>}
            {detail.title}
          </h2>
          <div className="forum-post-header-meta muted">
            <span>{displayName(detail.author_pubkey)}</span>
            <span> · {formatRelative(detail.created_at)}</span>
            {detail.edited_at && <span> (edited)</span>}
          </div>
          {canManage && (
            <div className="forum-post-mod-actions">
              <button className="btn-secondary" onClick={handlePin}>
                {detail.is_pinned ? "Unpin" : "Pin"}
              </button>
              <button className="btn-secondary" onClick={handleLock}>
                {detail.is_locked ? "Unlock" : "Lock"}
              </button>
            </div>
          )}
        </header>
        <div className="forum-post-body">{detail.body}</div>
      </article>

      {detail.is_locked && (
        <div className="forum-locked-banner muted">This post is locked — no new replies.</div>
      )}

      <section className="forum-replies">
        <h3 className="forum-replies-title">{detail.reply_count} {detail.reply_count === 1 ? "reply" : "replies"}</h3>
        {detail.replies.map(renderReply)}
        {replyCursor && (
          <button className="btn-secondary" onClick={loadMoreReplies}>Load more replies</button>
        )}
      </section>

      {canReply && (
        <div className="forum-reply-composer">
          {replyTo && (
            <div className="forum-reply-to-badge muted">
              Replying to a message —{" "}
              <button className="btn-link" onClick={() => setReplyTo(null)}>clear</button>
            </div>
          )}
          <textarea
            className="forum-reply-input"
            placeholder={replyTo ? "Write a reply…" : "Add a reply…"}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            rows={3}
            disabled={submitting}
          />
          <button
            onClick={handleSendReply}
            disabled={submitting || !replyBody.trim()}
          >
            {submitting ? "Sending…" : "Reply"}
          </button>
        </div>
      )}
    </div>
  );
}
