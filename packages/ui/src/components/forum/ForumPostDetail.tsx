import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { PostDetail, ReplyView, ReactionCount, ForumAttachment } from "../../types";
import { formatRelative, formatPubkey } from "@wavvon/core";
import { describeForumWriteError } from "./forumErrors";
import type { ForumActions } from "./ForumView";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

interface Props {
  postId: string;
  channelId: string;
  publicKey: string | null;
  isAdmin: boolean;
  canManagePosts: boolean;
  actions: ForumActions;
  onBack: () => void;
  /** Set when this post lives in a read-through alliance-shared forum, not a
   * locally-owned channel -- routes the detail fetch (and, when `canWrite`
   * allows it, replies/reactions) through the alliance proxy. `readOnly`
   * always disables moderation and edit/delete, which have no alliance
   * write-proxy regardless of policy. */
  allianceId?: string;
  readOnly?: boolean;
  /** Whether replying and reacting to posts is allowed in this alliance
   * context (forum_remote_write !== "none"). Ignored when `allianceId` is
   * unset -- local channels are always writable per the caller's roles. */
  canWrite?: boolean;
}

interface ReactionBarProps {
  reactions: ReactionCount[];
  onToggle: (emoji: string, me: boolean) => void;
  readOnly?: boolean;
}

function ReactionBar({ reactions, onToggle, readOnly }: ReactionBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const shown = reactions.filter((r) => r.count > 0);

  if (readOnly) {
    if (!shown.length) return null;
    return (
      <div className="reaction-bar">
        {shown.map((r) => (
          <span key={r.emoji} className="reaction-chip">{r.emoji} {r.count}</span>
        ))}
      </div>
    );
  }

  return (
    <div className="reaction-bar">
      {shown.map((r) => (
        <button
          key={r.emoji}
          className={`reaction-chip${r.me ? " active" : ""}`}
          onClick={() => onToggle(r.emoji, r.me)}
          title={r.me ? "Remove reaction" : "Add reaction"}
        >
          {r.emoji} {r.count}
        </button>
      ))}
      <div style={{ position: "relative", display: "inline-block" }}>
        <button
          className="btn-ghost reaction-add-btn"
          onClick={() => setPickerOpen((v) => !v)}
          title="Add reaction"
        >
          +
        </button>
        {pickerOpen && (
          <div className="reaction-quick-picker">
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                className="btn-ghost"
                onClick={() => {
                  setPickerOpen(false);
                  const existing = reactions.find((r) => r.emoji === e);
                  onToggle(e, existing?.me ?? false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AttachmentList({ attachments }: { attachments: ForumAttachment[] }) {
  if (!attachments.length) return null;
  return (
    <div className="forum-attachments">
      {attachments.map((a) => (
        <a
          key={a.url}
          href={a.url}
          target="_blank"
          rel="noreferrer"
          className="forum-attachment-link"
        >
          {a.name}
          <span className="muted" style={{ marginLeft: 4, fontSize: "var(--text-sm)" }}>
            ({(a.size / 1024).toFixed(1)} KB)
          </span>
        </a>
      ))}
    </div>
  );
}

export function ForumPostDetail({
  postId, channelId, publicKey, isAdmin, canManagePosts, actions, onBack, allianceId, readOnly, canWrite = true,
}: Props) {
  const { t } = useTranslation();
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
      const p = allianceId
        ? await actions.getAlliancePost!(allianceId, channelId, postId)
        : await actions.getPost(channelId, postId);
      setPost(p);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    setLoading(true);
    reload().finally(() => {
      setLoading(false);
      // Read markers are local-only state on this hub's own channel rows --
      // an alliance-proxied channel id doesn't exist here, so skip it.
      if (!readOnly) void actions.markPostRead(channelId, postId).catch(() => undefined);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, channelId, allianceId]);

  async function handleSendReply() {
    if (!post || !replyBody.trim()) return;
    setSubmitting(true);
    try {
      if (allianceId) {
        await actions.createAllianceReply!(allianceId, channelId, post.id, replyBody.trim(), replyTo);
      } else {
        await actions.createReply(channelId, post.id, replyBody.trim(), replyTo);
      }
      setReplyBody("");
      setReplyTo(undefined);
      await reload();
    } catch (e) {
      setError(describeForumWriteError(e, t));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSavePostEdit() {
    if (!post || editingPostBody === null) return;
    try {
      await actions.editPost(channelId, post.id, post.title ?? undefined, editingPostBody);
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
      await actions.deletePost(channelId, post.id);
      onBack();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSaveReplyEdit() {
    if (!post || !editingReplyId || !editingReplyBody.trim()) return;
    try {
      await actions.editReply(channelId, post.id, editingReplyId, editingReplyBody.trim());
      setEditingReplyId(null);
      setEditingReplyBody("");
      await reload();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDeleteReply(replyId: string) {
    if (!post) return;
    if (!confirm("Delete this reply?")) return;
    try {
      await actions.deleteReply(channelId, post.id, replyId);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handlePin() {
    if (!post) return;
    try {
      await actions.pinPost(channelId, post.id, !post.is_pinned);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleLock() {
    if (!post) return;
    try {
      await actions.lockPost(channelId, post.id, !post.is_locked);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handlePostReaction(emoji: string, me: boolean) {
    if (!post) return;
    try {
      if (allianceId) {
        // ponytail: alliance forum federation only proxies adding a
        // reaction, not removing one -- a repeat click on an already-active
        // reaction here is a no-op until an unreact proxy exists.
        if (me) return;
        await actions.reactAlliancePost!(allianceId, channelId, post.id, emoji);
      } else if (me) {
        await actions.removePostReaction(channelId, post.id, emoji);
      } else {
        await actions.addPostReaction(channelId, post.id, emoji);
      }
      await reload();
    } catch (e) {
      setError(describeForumWriteError(e, t));
    }
  }

  async function handleReplyReaction(replyId: string, emoji: string, me: boolean) {
    if (!post) return;
    try {
      if (me) {
        await actions.removeReplyReaction(channelId, post.id, replyId, emoji);
      } else {
        await actions.addReplyReaction(channelId, post.id, replyId, emoji);
      }
      await reload();
    } catch (e) {
      setError(String(e));
    }
  }

  const canModerate = !readOnly && (isAdmin || canManagePosts);

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
          {post.author_hub && <span title={post.author_hub}> · via {formatPubkey(post.author_hub)}</span>}
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
        {!readOnly && (canModerate || post.author_pubkey === publicKey) && !post.is_deleted && (
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

      {!post.is_deleted && (
        <>
          <AttachmentList attachments={post.attachments ?? []} />
          <ReactionBar
            reactions={post.reactions ?? []}
            onToggle={(emoji, me) => void handlePostReaction(emoji, me)}
            readOnly={!canWrite}
          />
        </>
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
            onReaction={(emoji, me) => void handleReplyReaction(reply.id, emoji, me)}
            readOnly={readOnly}
            canWrite={canWrite}
          />
        ))}
      </div>

      {!canWrite ? (
        <div className="forum-locked-banner">
          <span>👀 Read-only — hosted on another hub, replies aren't available here yet.</span>
        </div>
      ) : post.is_locked && !canModerate ? (
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
  onReaction: (emoji: string, me: boolean) => void;
  readOnly?: boolean;
  canWrite?: boolean;
}

function ForumReplyRow({
  reply, replies, publicKey, canModerate,
  editingId, editingBody, replyingTo,
  onEditStart, onEditSave, onEditCancel, onEditBodyChange, onDelete, onReplyTo, onReaction,
  readOnly, canWrite = true,
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
        {reply.author_hub && <span title={reply.author_hub}> · via {formatPubkey(reply.author_hub)}</span>}
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
        <>
          <AttachmentList attachments={reply.attachments ?? []} />
          <ReactionBar
            reactions={reply.reactions ?? []}
            onToggle={onReaction}
            readOnly={readOnly}
          />
          {(canWrite || !readOnly) && (
            <div className="forum-reply-actions">
              {canWrite && (
                <button className="btn-ghost" onClick={() => onReplyTo(reply.id)}>
                  {replyingTo === reply.id ? "Cancel reply" : "Reply"}
                </button>
              )}
              {!readOnly && (canModerate || reply.author_pubkey === publicKey) && (
                <>
                  <button className="btn-ghost" onClick={() => onEditStart(reply)}>Edit</button>
                  <button className="btn-ghost danger" onClick={() => onDelete(reply.id)}>Delete</button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
