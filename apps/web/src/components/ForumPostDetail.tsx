import { useState, useEffect } from "react";
import type { PostDetail, ReplyView } from "../types";
import { formatRelative } from "@wavvon/core";
import {
  forumGetPost,
  forumCreateReply,
  forumEditPost,
  forumDeletePost,
  forumEditReply,
  forumDeleteReply,
  forumPinPost,
  forumLockPost,
  markPostRead,
} from "../platform/commands/forum";

interface Props {
  postId: string;
  channelId: string;
  publicKey: string | null;
  isAdmin: boolean;
  canManagePosts: boolean;
  onBack: () => void;
}

export function ForumPostDetail({ postId, channelId, publicKey, isAdmin, canManagePosts, onBack }: Props) {
  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [editingPostBody, setEditingPostBody] = useState<string | null>(null);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editingReplyBody, setEditingReplyBody] = useState("");

  async function reload() {
    try {
      const p = await forumGetPost(postId);
      setPost(p);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    setLoading(true);
    reload().finally(() => {
      setLoading(false);
      // Fire-and-forget: mark this post as read once loaded.
      void markPostRead(channelId, postId).catch(() => undefined);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, channelId]);

  async function handleSendReply() {
    if (!post || !replyBody.trim()) return;
    setSubmitting(true);
    try {
      await forumCreateReply(post.id, replyBody.trim(), replyTo);
      setReplyBody("");
      setReplyTo(undefined);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSavePostEdit() {
    if (!post || editingPostBody === null) return;
    try {
      await forumEditPost(post.id, post.title ?? undefined, editingPostBody);
      setEditingPostBody(null);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDeletePost() {
    if (!post) return;
    if (!confirm("Delete this post?")) return;
    try {
      await forumDeletePost(post.id);
      onBack();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSaveReplyEdit() {
    if (!editingReplyId || !editingReplyBody.trim()) return;
    try {
      await forumEditReply(editingReplyId, editingReplyBody.trim());
      setEditingReplyId(null);
      setEditingReplyBody("");
      await reload();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDeleteReply(replyId: string) {
    if (!confirm("Delete this reply?")) return;
    try {
      await forumDeleteReply(replyId);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handlePin() {
    if (!post) return;
    try {
      await forumPinPost(post.id, !post.is_pinned);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleLock() {
    if (!post) return;
    try {
      await forumLockPost(post.id, !post.is_locked);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  }

  const canModerate = isAdmin || canManagePosts;

  if (loading) return <div className="forum-detail"><p className="muted">Loading…</p></div>;
  if (error) return <div className="forum-detail"><p className="error-text">{error}</p></div>;
  if (!post) return null;

  return (
    <div className="forum-detail">
      <div className="forum-detail-nav">
        <button className="btn-secondary" onClick={onBack}>← Back to posts</button>
      </div>

      <div className="forum-post-header">
        <h1 className="forum-post-title">
          {post.is_deleted ? "[deleted]" : (post.title || "(no title)")}
          {post.is_pinned && <span className="forum-badge pin" title="Pinned"> 📌</span>}
          {post.is_locked && <span className="forum-badge lock" title="Locked"> 🔒</span>}
        </h1>
        <div className="forum-post-submeta muted">
          {formatRelative(post.created_at)}
          {post.edited_at && ` · edited ${formatRelative(post.edited_at)}`}
        </div>
        {canModerate && !post.is_deleted && (
          <div className="forum-mod-actions">
            <button className="btn-secondary" onClick={handlePin}>
              {post.is_pinned ? "Unpin" : "Pin"}
            </button>
            <button className="btn-secondary" onClick={handleLock}>
              {post.is_locked ? "Unlock" : "Lock"}
            </button>
          </div>
        )}
        {(canModerate || post.author_pubkey === publicKey) && !post.is_deleted && (
          <div className="forum-author-actions">
            <button
              className="btn-secondary"
              onClick={() => setEditingPostBody(editingPostBody === null ? (post.body ?? "") : null)}
            >
              Edit
            </button>
            <button className="btn-secondary danger" onClick={handleDeletePost}>Delete</button>
          </div>
        )}
      </div>

      {editingPostBody !== null ? (
        <div className="forum-edit-post">
          <textarea
            rows={6}
            value={editingPostBody}
            onChange={(e) => setEditingPostBody(e.target.value)}
            style={{ width: "100%" }}
          />
          <div className="forum-edit-actions">
            <button onClick={handleSavePostEdit}>Save</button>
            <button className="btn-secondary" onClick={() => setEditingPostBody(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="forum-post-body">
          {post.is_deleted ? <p className="muted">[Content removed]</p> : <p>{post.body}</p>}
        </div>
      )}

      <div className="forum-replies">
        <h3 className="forum-replies-title">{post.reply_count} {post.reply_count === 1 ? "reply" : "replies"}</h3>
        {post.replies.map((reply) => (
          <ForumReplyRow
            key={reply.id}
            reply={reply}
            replies={post.replies}
            publicKey={publicKey}
            canModerate={canModerate}
            editingId={editingReplyId}
            editingBody={editingReplyBody}
            onEditStart={(r) => { setEditingReplyId(r.id); setEditingReplyBody(r.body ?? ""); }}
            onEditSave={handleSaveReplyEdit}
            onEditCancel={() => { setEditingReplyId(null); setEditingReplyBody(""); }}
            onEditBodyChange={setEditingReplyBody}
            onDelete={handleDeleteReply}
            onReplyTo={(id) => setReplyTo(replyTo === id ? undefined : id)}
            replyingTo={replyTo}
          />
        ))}
      </div>

      {post.is_locked && !canModerate ? (
        <div className="forum-locked-banner">
          <span>🔒 This post is locked. No new replies.</span>
        </div>
      ) : (
        <div className="forum-reply-composer">
          {replyTo && (
            <div className="forum-reply-to-hint muted">
              Replying to a comment
              <button className="btn-ghost" onClick={() => setReplyTo(undefined)} aria-label="Clear reply" title="Clear reply">×</button>
            </div>
          )}
          <textarea
            rows={3}
            placeholder="Write a reply…"
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            style={{ width: "100%" }}
          />
          <button
            className="btn-primary"
            onClick={handleSendReply}
            disabled={!replyBody.trim() || submitting}
          >
            {submitting ? "Sending…" : "Reply"}
          </button>
        </div>
      )}
    </div>
  );
}

interface ReplyRowProps {
  reply: ReplyView;
  replies: ReplyView[];
  publicKey: string | null;
  canModerate: boolean;
  editingId: string | null;
  editingBody: string;
  replyingTo: string | undefined;
  onEditStart: (r: ReplyView) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onEditBodyChange: (v: string) => void;
  onDelete: (id: string) => void;
  onReplyTo: (id: string) => void;
}

function ForumReplyRow({
  reply, replies, publicKey, canModerate,
  editingId, editingBody, replyingTo,
  onEditStart, onEditSave, onEditCancel, onEditBodyChange, onDelete, onReplyTo,
}: ReplyRowProps) {
  const quotedReply = reply.reply_to_id ? replies.find((r) => r.id === reply.reply_to_id) : null;
  const isEditing = editingId === reply.id;

  return (
    <div className={`forum-reply ${reply.is_deleted ? "deleted" : ""}`}>
      {quotedReply && !quotedReply.is_deleted && (
        <div className="forum-reply-quote muted">
          <span>↩ {quotedReply.body?.slice(0, 80)}{(quotedReply.body?.length ?? 0) > 80 ? "…" : ""}</span>
        </div>
      )}
      <div className="forum-reply-meta muted">
        {formatRelative(reply.created_at)}
        {reply.edited_at && " · edited"}
      </div>
      {isEditing ? (
        <div className="forum-edit-reply">
          <textarea
            rows={3}
            value={editingBody}
            onChange={(e) => onEditBodyChange(e.target.value)}
            style={{ width: "100%" }}
          />
          <div className="forum-edit-actions">
            <button onClick={onEditSave}>Save</button>
            <button className="btn-secondary" onClick={onEditCancel}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="forum-reply-body">
          {reply.is_deleted ? <p className="muted">[deleted]</p> : <p>{reply.body}</p>}
        </div>
      )}
      {!reply.is_deleted && !isEditing && (
        <div className="forum-reply-actions">
          <button className="btn-ghost" onClick={() => onReplyTo(reply.id)}>
            {replyingTo === reply.id ? "Cancel reply" : "Reply"}
          </button>
          {(canModerate || reply.author_pubkey === publicKey) && (
            <>
              <button className="btn-ghost" onClick={() => onEditStart(reply)}>Edit</button>
              <button className="btn-ghost danger" onClick={() => onDelete(reply.id)}>Delete</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
