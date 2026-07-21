import { useState, useEffect, useCallback } from "react";
import type { PostSummary, ForumTagDef } from "../../types";
import { formatRelative, formatPubkey } from "@wavvon/core";
import type { ForumActions } from "./ForumView";

interface Props {
  channelId: string;
  canCreatePost: boolean;
  publicKey: string | null;
  actions: Pick<ForumActions, "listPosts" | "listAlliancePosts" | "listTags">;
  onOpenPost: (post: PostSummary) => void;
  onNewPost: () => void;
  /** Set when this channel is a read-through alliance-shared forum, not a
   * locally-owned one -- routes list fetches through the alliance proxy. */
  allianceId?: string;
}

export function ForumPostList({ channelId, canCreatePost, actions, onOpenPost, onNewPost, allianceId }: Props) {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<ForumTagDef[]>([]);
  const [activeTagId, setActiveTagId] = useState<string | undefined>(undefined);

  const load = useCallback(async (replace: boolean, cur?: string, tagId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = allianceId
        ? await actions.listAlliancePosts!(allianceId, channelId, cur, tagId)
        : await actions.listPosts(channelId, cur, tagId);
      setPosts((prev) => replace ? res.posts : [...prev, ...res.posts]);
      setCursor(res.cursor);
      setHasMore(!!res.cursor);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, allianceId, actions]);

  useEffect(() => {
    void load(true, undefined, activeTagId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, activeTagId]);

  useEffect(() => {
    if (!actions.listTags) return;
    actions.listTags(channelId).then(setTags).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, actions.listTags]);

  const pinned = posts.filter((p) => p.is_pinned && !p.is_deleted);
  const rest = posts.filter((p) => !p.is_pinned && !p.is_deleted);
  const deleted = posts.filter((p) => p.is_deleted);

  return (
    <div className="forum-list">
      <div className="forum-list-header">
        <h2 className="forum-list-title">Posts</h2>
        {canCreatePost && (
          <button className="btn-primary" onClick={onNewPost}>New post</button>
        )}
      </div>
      {tags.length > 0 && (
        <div className="forum-tag-row">
          <button
            type="button"
            className={`forum-tag-chip toggle${activeTagId === undefined ? " active" : ""}`}
            onClick={() => setActiveTagId(undefined)}
            aria-pressed={activeTagId === undefined}
          >
            All
          </button>
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className={`forum-tag-chip toggle${activeTagId === tag.id ? " active" : ""}`}
              style={tag.color ? { borderColor: tag.color, background: activeTagId === tag.id ? tag.color : undefined } : undefined}
              onClick={() => setActiveTagId(activeTagId === tag.id ? undefined : tag.id)}
              aria-pressed={activeTagId === tag.id}
            >
              {tag.label}
            </button>
          ))}
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      {pinned.length > 0 && (
        <div className="forum-pinned-band">
          <span className="forum-section-label muted">Pinned</span>
          {pinned.map((p) => <ForumPostRow key={p.id} post={p} onClick={() => onOpenPost(p)} />)}
        </div>
      )}
      <div className="forum-post-rows">
        {rest.map((p) => <ForumPostRow key={p.id} post={p} onClick={() => onOpenPost(p)} />)}
      </div>
      {deleted.length > 0 && (
        <div className="forum-post-rows">
          {deleted.map((p) => <ForumPostRow key={p.id} post={p} onClick={() => onOpenPost(p)} />)}
        </div>
      )}
      {posts.length === 0 && !loading && !error && (
        <p className="muted" style={{ padding: "24px 0" }}>No posts yet. Be the first!</p>
      )}
      {loading && <p className="muted">Loading…</p>}
      {hasMore && !loading && (
        <button className="btn-secondary" onClick={() => void load(false, cursor, activeTagId)}>Load more</button>
      )}
    </div>
  );
}

function ForumPostRow({ post, onClick }: { post: PostSummary; onClick: () => void }) {
  return (
    <div
      className={`forum-post-row ${post.is_deleted ? "deleted" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
    >
      <div className="forum-post-row-main">
        <span className="forum-post-title">
          {post.is_deleted ? "[deleted]" : (post.title || "(no title)")}
          {post.is_pinned && <span className="forum-badge pin" title="Pinned">📌</span>}
          {post.is_locked && <span className="forum-badge lock" title="Locked">🔒</span>}
          {!post.is_deleted && post.tags && post.tags.length > 0 && (
            <span className="forum-tag-row inline">
              {post.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="forum-tag-chip"
                  style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}
                >
                  {tag.label}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="forum-post-meta muted">
          {formatRelative(post.last_activity_at)} · {post.reply_count} {post.reply_count === 1 ? "reply" : "replies"}
          {post.author_hub && <span title={post.author_hub}> · via {formatPubkey(post.author_hub)}</span>}
          {post.unread_reply_count != null && post.unread_reply_count > 0 && (
            <span className="unread-badge">{post.unread_reply_count} new</span>
          )}
        </span>
      </div>
    </div>
  );
}
