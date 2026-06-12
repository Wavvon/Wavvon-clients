import React from "react";
import type { Channel, User, RoleInfo, PostSummary } from "../../types";
import { ForumComposer } from "../ForumComposer";
import { ForumPostDetail } from "../ForumPostDetail";
import { ForumPostList } from "../ForumPostList";

interface Props {
  selectedChannel: Channel;
  activeHubUrl: string;
  users: User[];
  myRoles: RoleInfo[];
  myPubkey: string | null;
  forumSelectedPost: PostSummary | null;
  forumComposing: boolean;
  onSetForumSelectedPost: (post: PostSummary | null) => void;
  onSetForumComposing: (v: boolean) => void;
}

export function ForumView({
  selectedChannel,
  activeHubUrl,
  users,
  myRoles,
  myPubkey,
  forumSelectedPost,
  forumComposing,
  onSetForumSelectedPost,
  onSetForumComposing,
}: Props) {
  return (
    <div className="forum-area">
      {forumComposing ? (
        <ForumComposer
          channelId={selectedChannel.id}
          activeHubUrl={activeHubUrl}
          onCreated={(post) => { onSetForumComposing(false); onSetForumSelectedPost(post); }}
          onCancel={() => onSetForumComposing(false)}
        />
      ) : forumSelectedPost ? (
        <ForumPostDetail
          postSummary={forumSelectedPost}
          channelId={selectedChannel.id}
          activeHubUrl={activeHubUrl}
          users={users}
          myPubkey={myPubkey}
          myRoles={myRoles}
          onBack={() => onSetForumSelectedPost(null)}
          onPostUpdated={(updated) => onSetForumSelectedPost(updated)}
        />
      ) : (
        <ForumPostList
          channel={selectedChannel}
          users={users}
          myRoles={myRoles}
          activeHubUrl={activeHubUrl}
          onSelectPost={(post) => onSetForumSelectedPost(post)}
          onNewPost={() => onSetForumComposing(true)}
        />
      )}
    </div>
  );
}
