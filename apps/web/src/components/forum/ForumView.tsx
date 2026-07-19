import React, { useState } from "react";
import type { RoleInfo } from "@shared/types";
import { ForumComposer } from "./ForumComposer";
import { ForumPostDetail } from "./ForumPostDetail";
import { ForumPostList } from "./ForumPostList";

/** Set when rendering an alliance-shared forum channel read through from
 * another hub (forum.md §9) -- forces the whole view read-only, since the
 * federation slice has no write proxy yet. */
export interface ForumAllianceContext {
  allianceId: string;
  allianceName: string;
  hubName: string;
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
  const readOnly = !!allianceContext;

  const canCreatePost = !readOnly && myRoles.some((r) =>
    r.permissions.some((p) => p === "admin" || p === "create_posts")
  );
  const canManagePosts = !readOnly && myRoles.some((r) =>
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
          readOnly={readOnly}
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
