import { useState } from "react";
import type React from "react";
import type {
  Channel,
  Hub,
  Message,
  DmMessage,
  Attachment,
  User,
  RoleInfo,
  Conversation,
  AllianceSharedChannel,
  VoiceParticipant,
  ActiveStream,
  ForumAttachment,
} from "@shared/types";
import {
  ContentArea as SharedContentArea,
  type UserProfileCardActions,
  type ScreenShareViewerRef,
  type ForumActions,
  type MessageRowActions,
  type CreateEventPayload,
  type Poll,
  type HubEvent,
  type RsvpStatus,
  type HubEmoji,
} from "@wavvon/ui";
import { PinnedMessagesModal } from "@components/content/PinnedMessagesModal";
import {
  hubFetch, getPolls, createPoll, getBotProfile, sendBotAppJoin,
  pinMessage, unpinMessage, votePoll, deletePoll, fetchLinkPreview, reportMessage,
  forumListPosts, forumGetPost, forumCreatePost, forumEditPost, forumDeletePost,
  forumCreateReply, forumEditReply, forumDeleteReply, forumPinPost, forumLockPost,
  markPostRead, forumAddPostReaction, forumRemovePostReaction, forumAddReplyReaction,
  forumRemoveReplyReaction, forumListTags, forumCreateTag, forumEditTag, forumDeleteTag,
  getAllianceChannelPosts, getAllianceChannelPost,
  createAllianceChannelPost, createAllianceChannelReply, reactAllianceChannelPost,
  getEvents, getEvent, createEvent, rsvpEvent, deleteEvent,
  getEventRsvps, getEventAssignments, createEventSquadRooms, previewHubInfo,
  uploadFile,
} from "@platform";
import { activeSession } from "../../platform/session";
import { getScoped, setScoped } from "@shared/utils/accountScope";

// Every op is channel-scoped: the hub registers ONLY nested routes
// (/channels/{cid}/posts/{pid}/…), so channelId is required all the way down.
const forumActions: ForumActions = {
  listPosts: (channelId, cursor, tagId) => forumListPosts(channelId, cursor, tagId),
  listAlliancePosts: getAllianceChannelPosts,
  getPost: (channelId, postId) => forumGetPost(channelId, postId),
  getAlliancePost: getAllianceChannelPost,
  createPost: (channelId, title, body, tagIds, attachments) =>
    forumCreatePost(channelId, title, body, tagIds, attachments),
  createAlliancePost: createAllianceChannelPost,
  uploadAttachment: async (channelId, file): Promise<ForumAttachment> => {
    const uploaded = await uploadFile(channelId, file);
    return { url: uploaded.url, name: uploaded.filename, mime: uploaded.mime_type, size: uploaded.size_bytes };
  },
  createReply: (channelId, postId, body, replyToId) => forumCreateReply(channelId, postId, body, replyToId),
  createAllianceReply: createAllianceChannelReply,
  editPost: (channelId, postId, title, body, tagIds) => forumEditPost(channelId, postId, title, body, tagIds),
  deletePost: (channelId, postId) => forumDeletePost(channelId, postId),
  editReply: (channelId, postId, replyId, body) => forumEditReply(channelId, postId, replyId, body),
  deleteReply: (channelId, postId, replyId) => forumDeleteReply(channelId, postId, replyId),
  pinPost: (channelId, postId, pin) => forumPinPost(channelId, postId, pin),
  lockPost: (channelId, postId, lock) => forumLockPost(channelId, postId, lock),
  markPostRead: (channelId, postId) => markPostRead(channelId, postId),
  addPostReaction: (channelId, postId, emoji) => forumAddPostReaction(channelId, postId, emoji),
  removePostReaction: (channelId, postId, emoji) => forumRemovePostReaction(channelId, postId, emoji),
  addReplyReaction: (channelId, postId, replyId, emoji) => forumAddReplyReaction(channelId, postId, replyId, emoji),
  removeReplyReaction: (channelId, postId, replyId, emoji) =>
    forumRemoveReplyReaction(channelId, postId, replyId, emoji),
  reactAlliancePost: reactAllianceChannelPost,
  listTags: (channelId) => forumListTags(channelId),
  createTag: (channelId, label, color, position) => forumCreateTag(channelId, label, color, position),
  editTag: (tagId, updates) => forumEditTag(tagId, updates),
  deleteTag: (tagId) => forumDeleteTag(tagId),
};

async function moderateAuthor(kind: "mute" | "kick" | "ban", pubkey: string) {
  const path = kind === "mute" ? "/moderation/mutes" : kind === "kick" ? "/moderation/kick" : "/moderation/bans";
  await hubFetch(path, { method: "POST", body: JSON.stringify({ target_public_key: pubkey }) });
}

const messageRowActions: MessageRowActions = {
  pinMessage, unpinMessage, votePoll, deletePoll, sendBotAppJoin, reportMessage,
  fetchLinkPreview: (hubUrl, url, token) => fetchLinkPreview(hubUrl, url, token ?? ""),
  muteUser: (pubkey) => moderateAuthor("mute", pubkey),
  kickUser: (pubkey) => moderateAuthor("kick", pubkey),
  banUser: (pubkey) => moderateAuthor("ban", pubkey),
};

function loadHubEmojis(): Promise<HubEmoji[]> {
  return hubFetch("/emojis").then((r) => r.json());
}

function loadThreadReplies(channelId: string, messageId: string): Promise<Message[]> {
  return hubFetch(`/channels/${channelId}/messages?thread_root=${messageId}`).then((r) => r.json());
}

function loadExpandedThreads(channelId: string): Set<string> {
  try {
    const raw = getScoped(`wavvon.threads.${channelId}`);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function saveExpandedThreads(channelId: string, ids: Set<string>): void {
  setScoped(`wavvon.threads.${channelId}`, JSON.stringify([...ids]));
}

function onComponentInteract(messageId: string, customId: string, values: string[]) {
  try {
    const { ws } = activeSession();
    ws?.send({ type: "component_interaction", message_id: messageId, custom_id: customId, values });
  } catch { /* no active session to send over */ }
}

function dismissKey(hubId: string): string {
  return `wavvon.welcomeBannerDismissed.${hubId}`;
}

function isWelcomeDismissed(hubId: string): boolean {
  try { return getScoped(dismissKey(hubId)) === "1"; } catch { return false; }
}

function dismissWelcome(hubId: string): void {
  try { setScoped(dismissKey(hubId), "1"); } catch { /* ignore */ }
}

interface SelectedAllianceChannel {
  alliance_id: string;
  alliance_name: string;
  channel: AllianceSharedChannel;
}

interface TypingEntry { name: string; ts: number }

interface SlashCommandEntry {
  command: string;
  description: string;
  bot_name: string;
}

interface Props {
  view: "channels" | "dms";
  activeHubId: string | null;
  hubs: Hub[];
  channels: Channel[];
  onBreadcrumbCategoryClick: (categoryId: string) => void;
  selectedChannel: Channel | null;
  selectedConversation: Conversation | null;
  selectedAllianceChannel: SelectedAllianceChannel | null;
  messages: Message[];
  searchResults: Message[] | null;
  searchOpen: boolean;
  searchQuery: string;
  dmMessages: Record<string, DmMessage[]>;
  allianceMessages: Message[];
  users: User[];
  publicKey: string | null;
  blockedUsers: Set<string>;
  ignoredUsers: Set<string>;
  knownDisplayNames: Set<string>;
  myDisplayName: string | null;
  isAdmin: boolean;
  myRoles: RoleInfo[];
  editingMessageId: string | null;
  editingDraft: string;
  replyTarget: Message | null;
  pendingAttachments: Attachment[];
  stickToBottom: boolean;
  newWhileScrolledUp: number;
  hubConnected: Record<string, boolean>;
  reconnectingHubs: Record<string, boolean>;
  memberSidebarHidden: boolean;
  voiceActiveUsers: Set<string>;
  selfInvisible: boolean;
  hideBirthdays?: boolean;
  inputText: string;
  typingByKey: Record<string, TypingEntry>;
  dmTypingByKey: Record<string, TypingEntry>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  messagesEndChannelRef: React.RefObject<HTMLLIElement | null>;
  messagesContainerRef: React.RefObject<HTMLOListElement | null>;
  messageInputRef: React.RefObject<HTMLInputElement | null>;
  onReconnect: () => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onSetReplyTarget: (message: Message | null) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: (message: Message) => void;
  onDeleteMessage: (messageId: string) => void;
  onSend: () => void;
  onSendDm: () => void;
  onSendAllianceMessage: () => void;
  onPingTyping: () => void;
  onPingDmTyping: () => void;
  onSetPendingAttachments: (items: Attachment[]) => void;
  onAttachFiles: (files: FileList | null) => void;
  onOpenEditDescription: (channel: Channel) => void;
  firstNotifyingMessageId: string | null;
  onClearFirstNotify: () => void;
  onScrollToMessage: (id: string) => void;
  onSetMemberSidebarHidden: (v: boolean) => void;
  onSetSearchOpen: (v: boolean) => void;
  onSetSearchQuery: (v: string) => void;
  onCloseSearch: () => void;
  onJumpToBottom: () => void;
  onMessagesScroll: () => void;
  onSetUserContextMenu: (menu: { x: number; y: number; user: User } | null) => void;
  onSetEditingDraft: (v: string) => void;
  onInputTextChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onOpenImage: (src: string, alt: string) => void;
  onToast: (msg: string) => void;
  onError: (msg: string) => void;
  slashCommands?: SlashCommandEntry[];
  activeScreenShares: ActiveStream[];
  screenShareViewerRef: React.RefObject<ScreenShareViewerRef | null>;
  onOpenHubStreams: () => void;
  pinnedMessageIds?: Set<string>;
  onPinToggle?: (messageId: string, isPinned: boolean) => void;
  onOpenUserProfile?: (pubkey: string) => void;
  onStartConversation?: (pubkey: string) => void;
  profileCardActions: UserProfileCardActions;
  voicePartByChannel: Record<string, VoiceParticipant[]>;
  canMoveMembers: boolean;
  onMoveMember: (targetPubkey: string, targetChannelId: string, eventId?: string) => void;
}

export function ContentArea(props: Props) {
  const [showPinsModal, setShowPinsModal] = useState(false);
  const { channels, users, voicePartByChannel, canMoveMembers, onMoveMember, isAdmin, publicKey, selectedChannel, onScrollToMessage } = props;

  function getEventsAction(params?: { upcoming?: boolean; limit?: number }): Promise<HubEvent[]> {
    return getEvents(params);
  }
  function rsvpEventAction(eventId: string, status: RsvpStatus, slotId?: string): Promise<void> {
    return rsvpEvent(eventId, status, slotId);
  }
  function createEventAction(payload: CreateEventPayload): Promise<HubEvent> {
    return createEvent(payload);
  }

  return (
    <>
      <SharedContentArea
        {...props}
        forumActions={forumActions}
        messageRowActions={messageRowActions}
        profileCardActions={props.profileCardActions}
        loadBotProfile={getBotProfile}
        loadHubEmojis={loadHubEmojis}
        loadChannelPolls={getPolls}
        loadThreadReplies={loadThreadReplies}
        loadExpandedThreads={loadExpandedThreads}
        saveExpandedThreads={saveExpandedThreads}
        onComponentInteract={onComponentInteract}
        onCreatePoll={createPoll}
        loadWelcomeInfo={previewHubInfo}
        isWelcomeDismissed={isWelcomeDismissed}
        dismissWelcome={dismissWelcome}
        eventsPresentation="tabs"
        getEvents={getEventsAction}
        deleteEvent={deleteEvent}
        rsvpEvent={rsvpEventAction}
        createEvent={createEventAction}
        eventStaging={{
          channels, users, voicePartByChannel, canMoveMembers, onMoveMember,
          getEvent, getEventAssignments, getEventRsvps, createEventSquadRooms,
        }}
        onShowPinned={() => setShowPinsModal(true)}
      />

      {showPinsModal && selectedChannel && (
        <PinnedMessagesModal
          channelId={selectedChannel.id}
          channelName={selectedChannel.name}
          onClose={() => setShowPinsModal(false)}
          onScrollToMessage={onScrollToMessage}
        />
      )}
    </>
  );
}
