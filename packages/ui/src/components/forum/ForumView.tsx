import { useState } from "react";
import type { PostDetail, PostListResponse, ReplyView, ForumTagDef, User } from "../../types";
import { ForumComposer } from "./ForumComposer";
import { ForumPostDetail } from "./ForumPostDetail";
import { ForumPostList } from "./ForumPostList";

/** Set when rendering an alliance-shared forum channel read through from
 * another hub (forum.md §9). `forumRemoteWrite` is this channel's
 * federated-write policy (SharedChannelResponse.forum_remote_write) and
 * drives which write affordances get un-gated -- see `canWrite` below.
 * Moderation (pin/lock/edit/delete) has no alliance write-proxy at all yet
 * and stays disabled regardless of policy. */
export interface ForumAllianceContext {
  allianceId: string;
  allianceName: string;
  hubName: string;
  forumRemoteWrite: "none" | "replies_only" | "posts_and_replies";
}

/** Data-access surface for the forum area, supplied by the app so this
 * package stays platform-free -- desktop wires these to invoke(), web wires
 * them to its hubFetch-based platform layer. Every non-alliance op takes
 * channelId (the hub's REST routes are channel-scoped) even where the
 * caller already knows it locally, so a single consistent shape works for
 * both platforms. Alliance variants are optional -- desktop doesn't wire
 * alliance forum access. */
export interface ForumActions {
  listPosts: (channelId: string, cursor?: string, tagId?: string) => Promise<PostListResponse>;
  listAlliancePosts?: (allianceId: string, channelId: string, cursor?: string, tagId?: string) => Promise<PostListResponse>;
  getPost: (channelId: string, postId: string) => Promise<PostDetail>;
  getAlliancePost?: (allianceId: string, channelId: string, postId: string) => Promise<PostDetail>;
  createPost: (channelId: string, title: string, body: string, tagIds?: string[]) => Promise<{ id: string }>;
  createAlliancePost?: (allianceId: string, channelId: string, title: string, body: string) => Promise<{ id: string }>;
  createReply: (channelId: string, postId: string, body: string, replyToId?: string) => Promise<{ id: string }>;
  createAllianceReply?: (
    allianceId: string,
    channelId: string,
    postId: string,
    body: string,
    replyToId?: string,
  ) => Promise<ReplyView>;
  /** `tagIds` omitted means "unchanged" (the omitted-vs-null trap, CLAUDE.md)
   * -- only pass it when the user actually touched the tag picker. */
  editPost: (
    channelId: string,
    postId: string,
    title: string | undefined,
    body: string,
    tagIds?: string[],
  ) => Promise<void>;
  deletePost: (channelId: string, postId: string) => Promise<void>;
  /** Tag definitions for the channel (forum.md §10.2); unset for alliance
   * read-through forums, which have no tag-definitions proxy in v1. */
  listTags?: (channelId: string) => Promise<ForumTagDef[]>;
  createTag?: (channelId: string, label: string, color?: string | null, position?: number) => Promise<ForumTagDef>;
  editTag?: (
    tagId: string,
    updates: { label?: string; color?: string | null; position?: number },
  ) => Promise<ForumTagDef>;
  deleteTag?: (tagId: string) => Promise<void>;
  editReply: (channelId: string, postId: string, replyId: string, body: string) => Promise<void>;
  deleteReply: (channelId: string, postId: string, replyId: string) => Promise<void>;
  pinPost: (channelId: string, postId: string, pin: boolean) => Promise<void>;
  lockPost: (channelId: string, postId: string, lock: boolean) => Promise<void>;
  markPostRead: (channelId: string, postId: string) => Promise<void>;
  addPostReaction: (channelId: string, postId: string, emoji: string) => Promise<void>;
  removePostReaction: (channelId: string, postId: string, emoji: string) => Promise<void>;
  addReplyReaction: (channelId: string, postId: string, replyId: string, emoji: string) => Promise<void>;
  removeReplyReaction: (channelId: string, postId: string, replyId: string, emoji: string) => Promise<void>;
  reactAlliancePost?: (allianceId: string, channelId: string, postId: string, emoji: string) => Promise<void>;
}

interface Props {
  channelId: string;
  myRoles: Array<{ permissions: string[] }>;
  myPubkey: string | null;
  isAdmin: boolean;
  actions: ForumActions;
  allianceContext?: ForumAllianceContext;
  /** Forum channel setting (forum.md §10.1) -- block a post/edit with no
   * tags when true. Alliance-proxied channels never set this (§10.4: remote
   * writes don't carry tags). */
  forumRequireTag?: boolean;
  /** Local hub roster, used to resolve post/reply `author_pubkey` to a
   * display name the same way MessageRow resolves message senders. Alliance
   * post authors live on another hub and won't be found here -- falls back
   * to the formatted pubkey, same as an unknown local user would. */
  users: User[];
}

export function ForumView({ channelId, myRoles, myPubkey, isAdmin, actions, allianceContext, forumRequireTag, users }: Props) {
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  // `alliance` gates moderation/edit/delete, which never have a write-proxy.
  // `canWrite` gates reply + react, un-gated once the policy allows it.
  const alliance = !!allianceContext;
  const canWrite = !alliance || allianceContext!.forumRemoteWrite !== "none";
  const canCreatePost = alliance
    ? allianceContext!.forumRemoteWrite === "posts_and_replies"
    : myRoles.some((r) => r.permissions.some((p) => p === "admin" || p === "create_posts"));
  const canManagePosts = !alliance && myRoles.some((r) =>
    r.permissions.some((p) => p === "admin" || p === "manage_posts")
  );

  return (
    <div className="forum-area">
      {allianceContext && (
        <p className="channel-description">
          🤝 {allianceContext.allianceName} · hosted on {allianceContext.hubName}
        </p>
      )}
      {composing ? (
        <ForumComposer
          channelId={channelId}
          allianceId={allianceContext?.allianceId}
          forumRequireTag={forumRequireTag}
          actions={actions}
          onCreated={(postId) => { setComposing(false); setSelectedPostId(postId); }}
          onCancel={() => setComposing(false)}
        />
      ) : selectedPostId ? (
        <ForumPostDetail
          postId={selectedPostId}
          channelId={channelId}
          publicKey={myPubkey}
          isAdmin={isAdmin}
          canManagePosts={canManagePosts}
          allianceId={allianceContext?.allianceId}
          readOnly={alliance}
          canWrite={canWrite}
          forumRequireTag={forumRequireTag}
          actions={actions}
          users={users}
          onBack={() => setSelectedPostId(null)}
        />
      ) : (
        <ForumPostList
          channelId={channelId}
          canCreatePost={canCreatePost}
          publicKey={myPubkey}
          allianceId={allianceContext?.allianceId}
          actions={actions}
          users={users}
          onOpenPost={(post) => setSelectedPostId(post.id)}
          onNewPost={() => setComposing(true)}
        />
      )}
    </div>
  );
}
