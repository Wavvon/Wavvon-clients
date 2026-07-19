import React, { useState } from "react";
import type { RoleInfo } from "@shared/types";
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

interface Props {
  channelId: string;
  myRoles: RoleInfo[];
  myPubkey: string | null;
  isAdmin: boolean;
  allianceContext?: ForumAllianceContext;
}

export function ForumView({ channelId, myRoles, myPubkey, isAdmin, allianceContext }: Props) {
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
          onBack={() => setSelectedPostId(null)}
        />
      ) : (
        <ForumPostList
          channelId={channelId}
          canCreatePost={canCreatePost}
          publicKey={myPubkey}
          allianceId={allianceContext?.allianceId}
          onOpenPost={(post) => setSelectedPostId(post.id)}
          onNewPost={() => setComposing(true)}
        />
      )}
    </div>
  );
}
