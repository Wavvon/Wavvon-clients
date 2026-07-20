import { hubFetch } from "../http";
import type { PostListResponse, PostDetail, ReplyView } from "../../types";

export async function forumListPosts(channelId: string, cursor?: string): Promise<PostListResponse> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  const r = await hubFetch(`/channels/${channelId}/posts?${params.toString()}`);
  return r.json() as Promise<PostListResponse>;
}

export async function forumGetPost(postId: string): Promise<PostDetail> {
  const r = await hubFetch(`/posts/${postId}`);
  return r.json() as Promise<PostDetail>;
}

export async function forumCreatePost(channelId: string, title: string, body: string): Promise<{ id: string }> {
  const r = await hubFetch(`/channels/${channelId}/posts`, {
    method: "POST",
    body: JSON.stringify({ title, body }),
  });
  return r.json() as Promise<{ id: string }>;
}

export async function forumEditPost(postId: string, title?: string, body?: string): Promise<void> {
  await hubFetch(`/posts/${postId}`, {
    method: "PATCH",
    body: JSON.stringify({ title, body }),
  });
}

export async function forumDeletePost(postId: string): Promise<void> {
  await hubFetch(`/posts/${postId}`, { method: "DELETE" });
}

export async function forumCreateReply(postId: string, body: string, replyToId?: string): Promise<{ id: string }> {
  const r = await hubFetch(`/posts/${postId}/replies`, {
    method: "POST",
    body: JSON.stringify({ body, reply_to_id: replyToId }),
  });
  return r.json() as Promise<{ id: string }>;
}

export async function forumEditReply(replyId: string, body: string): Promise<void> {
  await hubFetch(`/replies/${replyId}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
}

export async function forumDeleteReply(replyId: string): Promise<void> {
  await hubFetch(`/replies/${replyId}`, { method: "DELETE" });
}

export async function forumPinPost(postId: string, pin: boolean): Promise<void> {
  await hubFetch(`/posts/${postId}/pin`, { method: pin ? "POST" : "DELETE", body: JSON.stringify({}) });
}

export async function forumLockPost(postId: string, lock: boolean): Promise<void> {
  await hubFetch(`/posts/${postId}/lock`, { method: lock ? "POST" : "DELETE", body: JSON.stringify({}) });
}

export async function markPostRead(channelId: string, postId: string): Promise<void> {
  await hubFetch(`/channels/${channelId}/posts/${postId}/read`, { method: "POST" });
}

export async function forumAddPostReaction(postId: string, emoji: string): Promise<void> {
  await hubFetch(`/posts/${postId}/reactions`, {
    method: "POST",
    body: JSON.stringify({ emoji }),
  });
}

export async function forumRemovePostReaction(postId: string, emoji: string): Promise<void> {
  await hubFetch(`/posts/${postId}/reactions/${encodeURIComponent(emoji)}`, { method: "DELETE" });
}

export async function forumAddReplyReaction(replyId: string, emoji: string): Promise<void> {
  await hubFetch(`/replies/${replyId}/reactions`, {
    method: "POST",
    body: JSON.stringify({ emoji }),
  });
}

export async function forumRemoveReplyReaction(replyId: string, emoji: string): Promise<void> {
  await hubFetch(`/replies/${replyId}/reactions/${encodeURIComponent(emoji)}`, { method: "DELETE" });
}

export async function getAllianceChannelPosts(
  allianceId: string,
  channelId: string,
  cursor?: string,
): Promise<PostListResponse> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
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
