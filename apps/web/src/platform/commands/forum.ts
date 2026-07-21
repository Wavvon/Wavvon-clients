import { hubFetch } from "../http";
import type { PostListResponse, PostDetail, ReplyView, ForumTagDef } from "../../types";

export async function forumListPosts(channelId: string, cursor?: string, tagId?: string): Promise<PostListResponse> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (tagId) params.set("tag", tagId);
  const r = await hubFetch(`/channels/${channelId}/posts?${params.toString()}`);
  return r.json() as Promise<PostListResponse>;
}

export async function forumGetPost(channelId: string, postId: string): Promise<PostDetail> {
  const r = await hubFetch(`/channels/${channelId}/posts/${postId}`);
  return r.json() as Promise<PostDetail>;
}

export async function forumCreatePost(
  channelId: string,
  title: string,
  body: string,
  tagIds?: string[],
): Promise<{ id: string }> {
  const r = await hubFetch(`/channels/${channelId}/posts`, {
    method: "POST",
    body: JSON.stringify({ title, body, tag_ids: tagIds }),
  });
  return r.json() as Promise<{ id: string }>;
}

// tagIds omitted means "unchanged" (forum.md §10.2 -- the omitted-vs-null
// trap, CLAUDE.md); only pass it when the caller actually touched the picker.
export async function forumEditPost(
  channelId: string,
  postId: string,
  title?: string,
  body?: string,
  tagIds?: string[],
): Promise<void> {
  const body_: Record<string, unknown> = { title, body };
  if (tagIds !== undefined) body_.tag_ids = tagIds;
  await hubFetch(`/channels/${channelId}/posts/${postId}`, {
    method: "PATCH",
    body: JSON.stringify(body_),
  });
}

export async function forumListTags(channelId: string): Promise<ForumTagDef[]> {
  const r = await hubFetch(`/channels/${channelId}/tags`);
  return r.json() as Promise<ForumTagDef[]>;
}

export async function forumCreateTag(
  channelId: string,
  label: string,
  color?: string | null,
  position?: number,
): Promise<ForumTagDef> {
  const r = await hubFetch(`/channels/${channelId}/tags`, {
    method: "POST",
    body: JSON.stringify({ label, color, position }),
  });
  return r.json() as Promise<ForumTagDef>;
}

export async function forumEditTag(
  tagId: string,
  updates: { label?: string; color?: string | null; position?: number },
): Promise<ForumTagDef> {
  const r = await hubFetch(`/tags/${tagId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  return r.json() as Promise<ForumTagDef>;
}

export async function forumDeleteTag(tagId: string): Promise<void> {
  await hubFetch(`/tags/${tagId}`, { method: "DELETE" });
}

export async function forumDeletePost(channelId: string, postId: string): Promise<void> {
  await hubFetch(`/channels/${channelId}/posts/${postId}`, { method: "DELETE" });
}

export async function forumCreateReply(
  channelId: string,
  postId: string,
  body: string,
  replyToId?: string,
): Promise<{ id: string }> {
  const r = await hubFetch(`/channels/${channelId}/posts/${postId}/replies`, {
    method: "POST",
    body: JSON.stringify({ body, reply_to_id: replyToId }),
  });
  return r.json() as Promise<{ id: string }>;
}

export async function forumEditReply(channelId: string, postId: string, replyId: string, body: string): Promise<void> {
  await hubFetch(`/channels/${channelId}/posts/${postId}/replies/${replyId}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
}

export async function forumDeleteReply(channelId: string, postId: string, replyId: string): Promise<void> {
  await hubFetch(`/channels/${channelId}/posts/${postId}/replies/${replyId}`, { method: "DELETE" });
}

export async function forumPinPost(channelId: string, postId: string, pin: boolean): Promise<void> {
  await hubFetch(`/channels/${channelId}/posts/${postId}/pin`, {
    method: pin ? "POST" : "DELETE",
    body: JSON.stringify({}),
  });
}

export async function forumLockPost(channelId: string, postId: string, lock: boolean): Promise<void> {
  await hubFetch(`/channels/${channelId}/posts/${postId}/lock`, {
    method: lock ? "POST" : "DELETE",
    body: JSON.stringify({}),
  });
}

export async function markPostRead(channelId: string, postId: string): Promise<void> {
  await hubFetch(`/channels/${channelId}/posts/${postId}/read`, { method: "POST" });
}

export async function forumAddPostReaction(channelId: string, postId: string, emoji: string): Promise<void> {
  await hubFetch(`/channels/${channelId}/posts/${postId}/reactions`, {
    method: "POST",
    body: JSON.stringify({ emoji }),
  });
}

export async function forumRemovePostReaction(channelId: string, postId: string, emoji: string): Promise<void> {
  await hubFetch(`/channels/${channelId}/posts/${postId}/reactions/${encodeURIComponent(emoji)}`, {
    method: "DELETE",
  });
}

export async function forumAddReplyReaction(
  channelId: string,
  postId: string,
  replyId: string,
  emoji: string,
): Promise<void> {
  await hubFetch(`/channels/${channelId}/posts/${postId}/replies/${replyId}/reactions`, {
    method: "POST",
    body: JSON.stringify({ emoji }),
  });
}

export async function forumRemoveReplyReaction(
  channelId: string,
  postId: string,
  replyId: string,
  emoji: string,
): Promise<void> {
  await hubFetch(
    `/channels/${channelId}/posts/${postId}/replies/${replyId}/reactions/${encodeURIComponent(emoji)}`,
    { method: "DELETE" },
  );
}

export async function getAllianceChannelPosts(
  allianceId: string,
  channelId: string,
  cursor?: string,
  tagId?: string,
): Promise<PostListResponse> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (tagId) params.set("tag", tagId);
  const r = await hubFetch(`/alliances/${allianceId}/channels/${channelId}/posts?${params.toString()}`);
  return r.json() as Promise<PostListResponse>;
}

export async function getAllianceChannelPost(
  allianceId: string,
  channelId: string,
  postId: string,
  after?: string,
): Promise<PostDetail> {
  const params = new URLSearchParams();
  if (after) params.set("after", after);
  const r = await hubFetch(`/alliances/${allianceId}/channels/${channelId}/posts/${postId}?${params.toString()}`);
  return r.json() as Promise<PostDetail>;
}

// Requester-side alliance forum writes (forum federation phase 2). A
// locally-owned channel_id is served straight from the caller's own
// permissions on this hub; a peer-owned one is proxied over federation and
// gated by that channel's `forum_remote_write` policy -- see
// SharedChannelResponse.forum_remote_write and the 403 codes in
// mapAllianceForumWriteError below.

export async function createAllianceChannelPost(
  allianceId: string,
  channelId: string,
  title: string,
  body: string,
): Promise<{ id: string }> {
  const r = await hubFetch(`/alliances/${allianceId}/channels/${channelId}/posts`, {
    method: "POST",
    body: JSON.stringify({ title, body }),
  });
  return r.json() as Promise<{ id: string }>;
}

export async function createAllianceChannelReply(
  allianceId: string,
  channelId: string,
  postId: string,
  body: string,
  replyToId?: string,
): Promise<ReplyView> {
  const r = await hubFetch(`/alliances/${allianceId}/channels/${channelId}/posts/${postId}/replies`, {
    method: "POST",
    body: JSON.stringify({ body, reply_to_id: replyToId }),
  });
  return r.json() as Promise<ReplyView>;
}

export async function reactAllianceChannelPost(
  allianceId: string,
  channelId: string,
  postId: string,
  emoji: string,
): Promise<void> {
  await hubFetch(`/alliances/${allianceId}/channels/${channelId}/posts/${postId}/reactions`, {
    method: "POST",
    body: JSON.stringify({ emoji }),
  });
}

const FORUM_WRITE_ERROR_CODES = [
  "channel_not_shared_with_caller",
  "forum_remote_write_disabled",
  "forum_remote_write_posts_disabled",
] as const;

export type AllianceForumWriteErrorCode = (typeof FORUM_WRITE_ERROR_CODES)[number];

// The local-owner path (post_alliance_forum_post et al. delegating to the
// normal handler) never returns these codes; only the peer-proxy path does.
// A post/reply proxy failure additionally gets wrapped in a 502 by the
// owning-side federation client ("Failed to create forum post on peer:
// Peer returned HTTP 403 Forbidden: forum_remote_write_disabled"), so this
// matches on substring rather than an exact 403 + exact body.
export function allianceForumWriteErrorCode(message: string): AllianceForumWriteErrorCode | null {
  return FORUM_WRITE_ERROR_CODES.find((code) => message.includes(code)) ?? null;
}
