import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { PostSummary, ForumTagDef, User } from "../../types";
import { formatRelative, formatPubkey } from "@wavvon/core";
import type { ForumActions } from "./ForumView";
import { LockIcon, ForumIcon, SearchIcon } from "../Icons";
import { Avatar } from "../Avatar";

type ForumLayout = "list" | "grid";
// A member's choice for every forum, kept on this device.
const LAYOUT_KEY = "wavvon:forum-layout";

function readLayout(): ForumLayout {
  try { return localStorage.getItem(LAYOUT_KEY) === "grid" ? "grid" : "list"; } catch { return "list"; }
}

interface Props {
  channelId: string;
  channelName?: string;
  channelDescription?: string | null;
  canCreatePost: boolean;
  publicKey: string | null;
  actions: Pick<ForumActions, "listPosts" | "listAlliancePosts" | "listTags">;
  onOpenPost: (post: PostSummary) => void;
  onNewPost: () => void;
  /** Set when this channel is a read-through alliance-shared forum, not a
   * locally-owned one -- routes list fetches through the alliance proxy. */
  allianceId?: string;
  users: User[];
}

export function ForumPostList({ channelId, channelName, channelDescription, canCreatePost, publicKey, actions, onOpenPost, onNewPost, allianceId, users }: Props) {
  const { t } = useTranslation();
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<ForumTagDef[]>([]);
  const [activeTagId, setActiveTagId] = useState<string | undefined>(undefined);
  const [layout, setLayout] = useState<ForumLayout>(readLayout);
  const [query, setQuery] = useState("");
  const chooseLayout = (l: ForumLayout) => {
    setLayout(l);
    try { localStorage.setItem(LAYOUT_KEY, l); } catch { /* not remembered */ }
  };

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
  }, [channelId, allianceId, actions]);

  useEffect(() => {
    void load(true, undefined, activeTagId);
  }, [load, activeTagId]);

  useEffect(() => {
    if (!actions.listTags) return;
    actions.listTags(channelId).then(setTags).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, actions.listTags]);

  const q = query.trim().toLowerCase();
  const matches = (p: PostSummary) => !q || `${p.title ?? ""} ${p.excerpt ?? ""}`.toLowerCase().includes(q);
  // Pinned posts lead the list, marked rather than fenced off.
  const shown = [
    ...posts.filter((p) => p.is_pinned && !p.is_deleted),
    ...posts.filter((p) => !p.is_pinned && !p.is_deleted),
    ...posts.filter((p) => p.is_deleted),
  ].filter(matches);

  return (
    <div className="forum-list">
      <div className="channel-header forum-header">
        <div className="channel-header-info">
          <h1 className="channel-header-title">
            <ForumIcon size={18} />
            {channelName ?? t("forum.list.title")}
          </h1>
          {channelDescription && <p className="channel-description">{channelDescription}</p>}
        </div>
        <div className="forum-layout-toggle" role="group" aria-label={t("forum.list.layout")}>
          {(["list", "grid"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={layout === l}
              aria-label={t(l === "list" ? "forum.list.layout_list" : "forum.list.layout_grid")}
              title={t(l === "list" ? "forum.list.layout_list" : "forum.list.layout_grid")}
              onClick={() => chooseLayout(l)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={l === "list" ? LIST_GLYPH : GRID_GLYPH} />
              </svg>
            </button>
          ))}
        </div>
        {canCreatePost && (
          <button className="forum-new-post" onClick={onNewPost}>{t("forum.list.new_post")}</button>
        )}
      </div>

      <div className="forum-filters">
        <label className="forum-search">
          <SearchIcon size={14} />
          <input
            type="search"
            value={query}
            placeholder={t("forum.list.search")}
            aria-label={t("forum.list.search")}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {tags.length > 0 && (
          <>
            <button
              type="button"
              className={`forum-filter-chip${activeTagId === undefined ? " active" : ""}`}
              onClick={() => setActiveTagId(undefined)}
              aria-pressed={activeTagId === undefined}
            >
              {t("forum.list.all_tags")}
            </button>
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className={`forum-filter-chip${activeTagId === tag.id ? " active" : ""}`}
                onClick={() => setActiveTagId(activeTagId === tag.id ? undefined : tag.id)}
                aria-pressed={activeTagId === tag.id}
              >
                {tag.label}
              </button>
            ))}
          </>
        )}
      </div>

      {error && <p className="error-text forum-list-note">{error}</p>}
      <ul className={`forum-post-rows ${layout}`}>
        {shown.map((p) => <ForumPostRow key={p.id} post={p} users={users} layout={layout} self={!!publicKey && p.author_pubkey === publicKey} onClick={() => onOpenPost(p)} />)}
      </ul>
      {posts.length === 0 && !loading && !error && (
        <p className="muted forum-list-note">{t("forum.list.empty")}</p>
      )}
      {loading && <p className="muted forum-list-note">{t("forum.list.loading")}</p>}
      {hasMore && !loading && (
        <button className="btn-secondary forum-load-more" onClick={() => void load(false, cursor, activeTagId)}>{t("forum.list.load_more")}</button>
      )}
    </div>
  );
}

const LIST_GLYPH = "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01";
const GRID_GLYPH = "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z";

function ForumPostRow({ post, users, layout, self, onClick }: { post: PostSummary; users: User[]; layout: ForumLayout; self: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const user = users.find((u) => u.public_key === post.author_pubkey);
  const author = user?.display_name || formatPubkey(post.author_pubkey);
  const title = post.is_deleted ? t("forum.detail.deleted_title") : (post.title || t("forum.detail.no_title"));
  const tags = !post.is_deleted && post.tags && post.tags.length > 0 ? (
    post.tags.map((tag) => <span key={tag.id} className="forum-post-tag">{tag.label}</span>)
  ) : null;
  const marks = (
    <>
      {post.is_pinned && <span className="forum-pinned-mark">{t("forum.list.pinned_mark")}</span>}
      {post.is_locked && <span className="forum-badge lock" title={t("forum.list.locked")}><LockIcon size={12} /></span>}
    </>
  );
  const unread = post.unread_reply_count != null && post.unread_reply_count > 0
    ? <span className="unread-badge">{t("forum.list.new_replies", { count: post.unread_reply_count })}</span>
    : null;
  const via = post.author_hub ? <span title={post.author_hub}> · via {formatPubkey(post.author_hub)}</span> : null;

  return (
    <li>
      <button
        type="button"
        className={`forum-post-row ${layout}${post.is_deleted ? " deleted" : ""}${post.is_pinned ? " pinned" : ""}`}
        onClick={onClick}
      >
        {layout === "list" ? (
          <>
            {!post.is_deleted && <Avatar src={user?.avatar} name={author} pubkey={post.author_pubkey} size={36} self={self} />}
            <span className="forum-post-row-main">
              <span className="forum-post-title">{title}{marks}</span>
              {!post.is_deleted && post.excerpt && <span className="forum-post-excerpt">{post.excerpt}</span>}
              <span className="forum-post-meta">
                {tags}
                {!post.is_deleted && <span>{author} · </span>}
                {formatRelative(post.last_activity_at)}
                {via}
                {unread}
              </span>
            </span>
            <span className="forum-post-replies">
              <strong>{post.reply_count}</strong>
              {t("forum.list.replies_word", { count: post.reply_count })}
            </span>
          </>
        ) : (
          <>
            <span className="forum-post-meta">{tags}{marks}</span>
            <span className="forum-post-title">{title}</span>
            {!post.is_deleted && post.excerpt && <span className="forum-post-excerpt">{post.excerpt}</span>}
            <span className="forum-post-meta foot">
              {!post.is_deleted && <Avatar src={user?.avatar} name={author} pubkey={post.author_pubkey} size={22} self={self} />}
              {!post.is_deleted && <span>{author} · </span>}
              {formatRelative(post.last_activity_at)}
              {via}
              {unread}
              <strong className="forum-post-count">{t("forum.list.replies", { count: post.reply_count })}</strong>
            </span>
          </>
        )}
      </button>
    </li>
  );
}
