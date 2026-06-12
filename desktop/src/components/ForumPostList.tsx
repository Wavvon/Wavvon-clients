import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PostSummary, Channel, User } from "../types";
import { formatRelative } from "@voxply/utils";

interface Props {
  channel: Channel;
  users: User[];
  myRoles: { permissions: string[] }[];
  activeHubUrl: string;
  onSelectPost: (post: PostSummary) => void;
  onNewPost: () => void;
}

export function ForumPostList({ channel, users, myRoles, activeHubUrl, onSelectPost, onNewPost }: Props) {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = myRoles.some((r) => r.permissions.includes("create_posts") || r.permissions.includes("admin"));

  const load = useCallback(async (replace: boolean, afterCursor: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<{ posts: PostSummary[]; cursor: string | null }>("forum_list_posts", {
        hubUrl: activeHubUrl,
        channelId: channel.id,
        cursor: afterCursor,
      });
      setPosts((prev) => replace ? result.posts : [...prev, ...result.posts]);
      setCursor(result.cursor ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [activeHubUrl, channel.id]);

  useEffect(() => {
    setPosts([]);
    setCursor(null);
    load(true, null);
  }, [channel.id, load]);

  const pinned = posts.filter((p) => p.is_pinned && !p.is_deleted);
  const rest = posts.filter((p) => !p.is_pinned && !p.is_deleted);

  function displayName(pubkey: string) {
    return users.find((u) => u.public_key === pubkey)?.display_name || pubkey.slice(0, 12);
  }

  function renderRow(post: PostSummary) {
    return (
      <div
        key={post.id}
        className="forum-post-row"
        role="button"
        tabIndex={0}
        onClick={() => onSelectPost(post)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectPost(post); } }}
      >
        <div className="forum-post-row-main">
          <span className="forum-post-title">
            {post.is_pinned && <span className="forum-pin-icon" title="Pinned">📌</span>}
            {post.is_locked && <span className="forum-lock-icon" title="Locked">🔒</span>}
            {post.title}
          </span>
          <span className="forum-post-meta muted">
            {displayName(post.author_pubkey)} · {formatRelative(post.last_activity_at)}
          </span>
        </div>
        <div className="forum-post-row-aside muted">
          {post.reply_count} {post.reply_count === 1 ? "reply" : "replies"}
          {post.unread_reply_count != null && post.unread_reply_count > 0 && (
            <span className="unread-badge">{post.unread_reply_count} new</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="forum-post-list">
      <div className="forum-post-list-header">
        <h2 className="forum-channel-title">{channel.name}</h2>
        {canCreate && (
          <button className="primary" onClick={onNewPost}>New post</button>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {pinned.length > 0 && (
        <div className="forum-pinned-band">
          {pinned.map(renderRow)}
        </div>
      )}

      <div className="forum-post-rows">
        {rest.map(renderRow)}
        {rest.length === 0 && !loading && pinned.length === 0 && (
          <p className="muted forum-empty">No posts yet.{canCreate ? " Start the first one!" : ""}</p>
        )}
      </div>

      {loading && <p className="muted forum-loading">Loading…</p>}

      {cursor && !loading && (
        <button className="btn-secondary" onClick={() => load(false, cursor)}>Load more</button>
      )}
    </div>
  );
}
