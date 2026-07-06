import React, { useEffect, useState } from "react";
import type { PostSummary } from "../types";
import { formatRelative } from "@wavvon/core";

interface Props {
  channelId: string;
  hubUrl: string;
  publicKey: string | null;
  canCreatePost: boolean;
  onOpenPost: (post: PostSummary) => void;
  onNewPost: () => void;
}

export function ForumPostList({ channelId, hubUrl, publicKey, canCreatePost, onOpenPost, onNewPost }: Props) {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    load(undefined, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, hubUrl]);

  async function load(cur: string | undefined, replace: boolean) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (cur) params.set("cursor", cur);
      const res = await fetch(`${hubUrl}/channels/${channelId}/posts?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { posts: PostSummary[]; cursor?: string } = await res.json();
      setPosts((p) => replace ? data.posts : [...p, ...data.posts]);
      setCursor(data.cursor);
      setHasMore(!!data.cursor);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const pinned = posts.filter((p) => p.is_pinned && !p.is_deleted);
  const unpinned = posts.filter((p) => !p.is_pinned && !p.is_deleted);

  return (
    <div className="forum-post-list">
      <div className="forum-toolbar">
        <h2>Posts</h2>
        {canCreatePost && (
          <button className="btn-primary forum-new-post-btn" onClick={onNewPost}>
            New post
          </button>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
      {!loading && posts.length === 0 && (
        <p className="muted">No posts yet. Be the first to start a discussion.</p>
      )}
      {pinned.length > 0 && (
        <section className="forum-pinned-section">
          <h3 className="forum-section-label">Pinned</h3>
          <ul className="forum-list">
            {pinned.map((p) => <PostRow key={p.id} post={p} onOpen={onOpenPost} />)}
          </ul>
        </section>
      )}
      {unpinned.length > 0 && (
        <ul className="forum-list">
          {unpinned.map((p) => <PostRow key={p.id} post={p} onOpen={onOpenPost} />)}
        </ul>
      )}
      {hasMore && (
        <button className="btn-secondary forum-load-more" onClick={() => load(cursor, false)} disabled={loading}>
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}

function PostRow({ post, onOpen }: { post: PostSummary; onOpen: (p: PostSummary) => void }) {
  return (
    <li className="forum-post-row" onClick={() => onOpen(post)}>
      <div className="forum-post-row-title">
        {post.is_pinned && <span className="forum-badge pin-badge">📌</span>}
        {post.is_locked && <span className="forum-badge lock-badge">🔒</span>}
        <span className="forum-post-title">{post.title}</span>
      </div>
      <div className="forum-post-row-meta muted">
        <span>{formatRelative(post.last_activity_at)}</span>
        <span>
          {post.reply_count} {post.reply_count === 1 ? "reply" : "replies"}
          {post.unread_reply_count != null && post.unread_reply_count > 0 && (
            <span className="unread-badge"> {post.unread_reply_count} new</span>
          )}
        </span>
      </div>
    </li>
  );
}
