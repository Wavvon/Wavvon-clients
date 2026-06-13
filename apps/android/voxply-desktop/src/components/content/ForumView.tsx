import React, { useState } from "react";
import type { Channel, RoleInfo } from "../../types";
import type { PostSummary } from "../../types";
import { ForumComposer } from "../ForumComposer";
import { ForumPostDetail } from "../ForumPostDetail";
import { ForumPostList } from "../ForumPostList";

interface Props {
  selectedChannel: Channel;
  activeHubUrl: string;
  myRoles: RoleInfo[];
  myPubkey: string | null;
}

export function ForumView({ selectedChannel, activeHubUrl, myRoles, myPubkey }: Props) {
  const [forumPost, setForumPost] = useState<PostSummary | null>(null);
  const [showForumComposer, setShowForumComposer] = useState(false);

  const canManagePosts = myRoles.some((r) =>
    r.permissions.some((p) => p === "admin" || p === "manage_posts")
  );
  const canCreatePost = myRoles.some((r) =>
    r.permissions.some((p) => p === "admin" || p === "create_posts")
  );

  return (
    <div className="forum-content-area">
      {showForumComposer && (
        <ForumComposer
          channelId={selectedChannel.id}
          hubUrl={activeHubUrl}
          onCreated={() => { setShowForumComposer(false); setForumPost(null); }}
          onCancel={() => setShowForumComposer(false)}
        />
      )}
      {forumPost ? (
        <ForumPostDetail
          postId={forumPost.id}
          channelId={selectedChannel.id}
          hubUrl={activeHubUrl}
          publicKey={myPubkey}
          canManagePosts={canManagePosts}
          onBack={() => setForumPost(null)}
        />
      ) : (
        <ForumPostList
          channelId={selectedChannel.id}
          hubUrl={activeHubUrl}
          publicKey={myPubkey}
          canCreatePost={canCreatePost}
          onOpenPost={(post) => setForumPost(post)}
          onNewPost={() => setShowForumComposer(true)}
        />
      )}
    </div>
  );
}
