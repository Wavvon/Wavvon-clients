import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { PostDetail, ReplyView, ReactionCount, ForumAttachment, ForumTagDef, User } from "../../types";
import { formatRelative, formatPubkey } from "@wavvon/core";
import { describeForumWriteError } from "./forumErrors";
import { ForumTagPicker } from "./ForumTagPicker";
import { toggleTagSelection } from "../../utils/forumTags";
import { MessageContent } from "../MessageContent";
import { AutoGrowTextarea } from "../profile/AutoGrowTextarea";
import { EmojiPicker } from "../content/EmojiPicker";
import type { ForumActions } from "./ForumView";

const NO_MENTIONS = new Set<string>();
// 5 text rows at the --leading-normal line-height (1.5 * 14px).
const COMPOSER_MIN_HEIGHT = 5 * 21;

function authorLabel(users: User[], pubkey: string): string {
  return users.find((u) => u.public_key === pubkey)?.display_name || formatPubkey(pubkey);
}

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
  /** Channel setting (forum.md §10.1) -- block a retag-to-zero edit. */
  forumRequireTag?: boolean;
  /** Local hub roster, used to resolve `author_pubkey` to a display name
   * the same way MessageRow resolves message senders. */
  users: User[];
}

interface ReactionBarProps {
  reactions: ReactionCount[];
  onToggle: (emoji: string, me: boolean) => void;
  readOnly?: boolean;
}

function ReactionBar({ reactions, onToggle, readOnly }: ReactionBarProps) {
  const { t } = useTranslation();
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
          title={r.me ? t("forum.reaction.remove") : t("forum.reaction.add")}
        >
          {r.emoji} {r.count}
        </button>
      ))}
      <div style={{ position: "relative", display: "inline-block" }}>
        <button
          className="btn-ghost reaction-add-btn"
          onClick={() => setPickerOpen((v) => !v)}
          title={t("forum.reaction.add")}
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

interface PendingFile {
  file: File;
  objectUrl: string;
}

function AttachmentList({ attachments }: { attachments: ForumAttachment[] }) {
  const { t } = useTranslation();
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
            {t("forum.attachment.size", { size: (a.size / 1024).toFixed(1) })}
          </span>
        </a>
      ))}
    </div>
  );
}

export function ForumPostDetail({
  postId, channelId, publicKey, isAdmin, canManagePosts, actions, onBack, allianceId, readOnly, canWrite = true,
  forumRequireTag, users,
}: Props) {
  const { t } = useTranslation();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingPostBody, setEditingPostBody] = useState<string | null>(null);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editingReplyBody, setEditingReplyBody] = useState("");
  const [channelTags, setChannelTags] = useState<ForumTagDef[]>([]);
  // undefined = untouched -> editPost omits tagIds (unchanged, forum.md §10.2).
  const [editingTagIds, setEditingTagIds] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    if (allianceId || !actions.listTags) return;
    actions.listTags(channelId).then(setChannelTags).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, allianceId, actions.listTags]);

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

  function handleReplyFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (!picked.length) return;
    const next = picked.map((f) => ({ file: f, objectUrl: URL.createObjectURL(f) }));
    setPendingFiles((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeReplyFile(objectUrl: string) {
    setPendingFiles((prev) => {
      const removed = prev.find((f) => f.objectUrl === objectUrl);
      if (removed) URL.revokeObjectURL(removed.objectUrl);
      return prev.filter((f) => f.objectUrl !== objectUrl);
    });
  }

  async function handleSendReply() {
    if (!post || !replyBody.trim()) return;
    setSubmitting(true);
    try {
      if (allianceId) {
        await actions.createAllianceReply!(allianceId, channelId, post.id, replyBody.trim(), replyTo);
      } else {
        // Upload every pending file before creating the reply -- a partial
        // upload failure must not leave a reply with some attachments missing.
        const attachments = actions.uploadAttachment && pendingFiles.length > 0
          ? await Promise.all(pendingFiles.map((f) => actions.uploadAttachment!(channelId, f.file)))
          : undefined;
        await actions.createReply(channelId, post.id, replyBody.trim(), replyTo, attachments);
      }
      pendingFiles.forEach((f) => URL.revokeObjectURL(f.objectUrl));
      setPendingFiles([]);
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
    if (editingTagIds !== undefined && forumRequireTag && editingTagIds.length === 0) {
      setError(t("forum.detail.require_tag_error"));
      return;
    }
    try {
      await actions.editPost(channelId, post.id, post.title ?? undefined, editingPostBody, editingTagIds);
      setEditingPostBody(null);
      setEditingTagIds(undefined);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDeletePost() {
    if (!post) return;
    if (!confirm(t("forum.detail.delete_post_confirm"))) return;
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
    if (!confirm(t("forum.detail.delete_reply_confirm"))) return;
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

  if (loading) return <div className="forum-detail"><p className="muted">{t("forum.detail.loading")}</p></div>;
  if (error) return <div className="forum-detail"><p className="error-text">{error}</p></div>;
  if (!post) return null;

  return (
    <div className="forum-detail">
      <div className="forum-detail-nav">
        <button className="btn-secondary" onClick={onBack}>{t("forum.detail.back")}</button>
      </div>

      <div className="forum-post-header">
        <h1 className="forum-post-title">
          {post.is_deleted ? t("forum.detail.deleted_title") : (post.title || t("forum.detail.no_title"))}
          {post.is_pinned && <span className="forum-badge pin" title={t("forum.detail.pinned")}> 📌</span>}
          {post.is_locked && <span className="forum-badge lock" title={t("forum.detail.locked")}> 🔒</span>}
        </h1>
        <div className="forum-post-submeta muted">
          {!post.is_deleted && <span className="forum-post-author">{authorLabel(users, post.author_pubkey)} · </span>}
          {formatRelative(post.created_at)}
          {post.edited_at && ` ${t("forum.detail.edited_at", { when: formatRelative(post.edited_at) })}`}
          {post.author_hub && <span title={post.author_hub}> {t("forum.detail.via", { hub: formatPubkey(post.author_hub) })}</span>}
        </div>
        {!post.is_deleted && (canModerate || (!readOnly && post.author_pubkey === publicKey)) && (
          <div className="forum-post-actions">
            {canModerate && (
              <>
                <button className="btn-secondary" onClick={handlePin}>
                  {post.is_pinned ? t("forum.detail.unpin") : t("forum.detail.pin")}
                </button>
                <button className="btn-secondary" onClick={handleLock}>
                  {post.is_locked ? t("forum.detail.unlock") : t("forum.detail.lock")}
                </button>
              </>
            )}
            {!readOnly && (canModerate || post.author_pubkey === publicKey) && (
              <>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    if (editingPostBody === null) {
                      setEditingPostBody(post.body ?? "");
                      setEditingTagIds(undefined);
                    } else {
                      setEditingPostBody(null);
                      setEditingTagIds(undefined);
                    }
                  }}
                >
                  {t("forum.detail.edit")}
                </button>
                <button className="btn-secondary danger" onClick={handleDeletePost}>{t("forum.detail.delete")}</button>
              </>
            )}
          </div>
        )}
      </div>

      {editingPostBody !== null ? (
        <div className="forum-edit-post">
          <AutoGrowTextarea
            className="forum-composer-textarea"
            value={editingPostBody}
            onChange={setEditingPostBody}
            minHeight={COMPOSER_MIN_HEIGHT}
          />
          {!allianceId && channelTags.length > 0 && (
            <ForumTagPicker
              tags={channelTags}
              selected={editingTagIds ?? (post.tags?.map((t) => t.id) ?? [])}
              onToggle={(id) =>
                setEditingTagIds((prev) =>
                  toggleTagSelection(prev ?? post.tags?.map((t) => t.id) ?? [], id),
                )
              }
            />
          )}
          <div className="forum-edit-actions">
            <button onClick={handleSavePostEdit}>{t("forum.detail.save")}</button>
            <button className="btn-secondary" onClick={() => { setEditingPostBody(null); setEditingTagIds(undefined); }}>{t("forum.detail.cancel")}</button>
          </div>
        </div>
      ) : (
        <div className="forum-post-body">
          {post.is_deleted ? (
            <p className="muted">{t("forum.detail.content_removed")}</p>
          ) : (
            <MessageContent content={post.body ?? ""} knownNames={NO_MENTIONS} myName={null} />
          )}
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
        <h3 className="forum-replies-title">{t("forum.detail.replies", { count: post.reply_count })}</h3>
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
            users={users}
          />
        ))}
      </div>

      {!canWrite ? (
        <div className="forum-locked-banner">
          <span>{t("forum.detail.read_only_banner")}</span>
        </div>
      ) : post.is_locked && !canModerate ? (
        <div className="forum-locked-banner">
          <span>{t("forum.detail.locked_banner")}</span>
        </div>
      ) : (
        <div className="forum-reply-composer">
          {replyTo && (
            <div className="forum-reply-to-hint muted">
              {t("forum.detail.replying_to")}
              <button className="btn-ghost" onClick={() => setReplyTo(undefined)} aria-label={t("forum.detail.clear_reply")} title={t("forum.detail.clear_reply")}>×</button>
            </div>
          )}
          <AutoGrowTextarea
            className="forum-composer-textarea"
            placeholder={t("forum.detail.reply_placeholder")}
            value={replyBody}
            onChange={setReplyBody}
            minHeight={3 * 21}
          />
          <div className="settings-row" style={{ marginTop: 4 }}>
            <EmojiPicker buttonClassName="composer-btn" onPick={(emoji) => setReplyBody((prev) => prev + emoji)} />
          </div>
          {!allianceId && actions.uploadAttachment && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={handleReplyFileChange}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                {t("forum.detail.attach_file")}
              </button>
              {pendingFiles.length > 0 && (
                <ul className="forum-pending-attachments">
                  {pendingFiles.map((f) => (
                    <li key={f.objectUrl} className="forum-pending-attachment-row">
                      <span>{f.file.name}</span>
                      <button
                        type="button"
                        className="btn-ghost danger"
                        onClick={() => removeReplyFile(f.objectUrl)}
                        aria-label={t("forum.detail.remove_file", { name: f.file.name })}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <button
            className="btn-primary"
            onClick={handleSendReply}
            disabled={!replyBody.trim() || submitting}
          >
            {submitting ? t("forum.detail.sending") : t("forum.detail.reply")}
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
  users: User[];
}

function ForumReplyRow({
  reply, replies, publicKey, canModerate,
  editingId, editingBody, replyingTo,
  onEditStart, onEditSave, onEditCancel, onEditBodyChange, onDelete, onReplyTo, onReaction,
  readOnly, canWrite = true, users,
}: ReplyRowProps) {
  const { t } = useTranslation();
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
        {!reply.is_deleted && <span className="forum-post-author">{authorLabel(users, reply.author_pubkey)} · </span>}
        {formatRelative(reply.created_at)}
        {reply.edited_at && ` ${t("forum.detail.edited")}`}
        {reply.author_hub && <span title={reply.author_hub}> {t("forum.detail.via", { hub: formatPubkey(reply.author_hub) })}</span>}
      </div>
      {isEditing ? (
        <div className="forum-edit-reply">
          <AutoGrowTextarea
            className="forum-composer-textarea"
            value={editingBody}
            onChange={onEditBodyChange}
            minHeight={3 * 21}
          />
          <div className="forum-edit-actions">
            <button onClick={onEditSave}>{t("forum.detail.save")}</button>
            <button className="btn-secondary" onClick={onEditCancel}>{t("forum.detail.cancel")}</button>
          </div>
        </div>
      ) : (
        <div className="forum-reply-body">
          {reply.is_deleted ? (
            <p className="muted">{t("forum.detail.deleted_title")}</p>
          ) : (
            <MessageContent content={reply.body ?? ""} knownNames={NO_MENTIONS} myName={null} />
          )}
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
                  {replyingTo === reply.id ? t("forum.detail.cancel_reply") : t("forum.detail.reply")}
                </button>
              )}
              {!readOnly && (canModerate || reply.author_pubkey === publicKey) && (
                <>
                  <button className="btn-ghost" onClick={() => onEditStart(reply)}>{t("forum.detail.edit")}</button>
                  <button className="btn-ghost danger" onClick={() => onDelete(reply.id)}>{t("forum.detail.delete")}</button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
