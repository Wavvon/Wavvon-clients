import { hubFetch } from "../http";
import type { PostListResponse, PostDetail } from "../../types";

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
