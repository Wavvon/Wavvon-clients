import type { PostListResponse, PostSummary } from "../types";

/** Page size the forum asks for. */
export const FORUM_PAGE_SIZE = 50;

/**
 * The hub answers a forum list as a bare array, paged by the last post's id.
 * A short page is the last one; a full page may have more behind it.
 */
export function forumPage(posts: PostSummary[]): PostListResponse {
  return {
    posts,
    cursor: posts.length === FORUM_PAGE_SIZE ? posts[posts.length - 1].id : undefined,
  };
}
