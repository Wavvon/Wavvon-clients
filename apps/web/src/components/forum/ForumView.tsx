import React, { useState } from "react";
import type { Channel, RoleInfo } from "@shared/types";
import { ForumComposer } from "./ForumComposer";
import { ForumPostDetail } from "./ForumPostDetail";
import { ForumPostList } from "./ForumPostList";

interface Props {
  selectedChannel: Channel;
  myRoles: RoleInfo[];
  myPubkey: string | null;
  isAdmin: boolean;
}

export function ForumView({ selectedChannel, myRoles, myPubkey, isAdmin }: Props) {
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const canCreatePost = myRoles.some((r) =>
    r.permissions.some((p) => p === "admin" || p === "create_posts")
  );
  const canManagePosts = myRoles.some((r) =>
    r.permissions.some((p) => p === "admin" || p === "manage_posts")
  );

  return (
    <div className="forum-area">
      {composing ? (
        <ForumComposer
          channelId={selectedChannel.id}
          onCreated={(postId) => { setComposing(false); setSelectedPostId(postId); }}
          onCancel={() => setComposing(false)}
        />
      ) : selectedPostId ? (
        <ForumPostDetail
          postId={selectedPostId}
          channelId={selectedChannel.id}
          publicKey={myPubkey}
          isAdmin={isAdmin}
          canManagePosts={canManagePosts}
          onBack={() => setSelectedPostId(null)}
        />
      ) : (
        <ForumPostList
          channelId={selectedChannel.id}
          canCreatePost={canCreatePost}
          publicKey={myPubkey}
          onOpenPost={(post) => setSelectedPostId(post.id)}
          onNewPost={() => setComposing(true)}
        />
      )}
    </div>
  );
}
