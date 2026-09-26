import { useMemo, useState } from "react";
import { useConnectionStats } from "../../hooks/useConnectionStats";
import type {
  Channel,
  Message,
  User,
  RoleInfo,
  ForumAttachment,
} from "@shared/types";
import type { useChannelMessages } from "../../hooks/useChannelMessages";
import type { useDms } from "../../hooks/useDms";
import type { useAlliances } from "../../hooks/useAlliances";
import type { useHubLifecycle } from "../../hooks/useHubLifecycle";
import type { useHubConnection } from "../../hooks/useHubConnection";
import type { useVoice } from "../../hooks/useVoice";
import type { useScreenShare } from "../../hooks/useScreenShare";
import type { useNotificationPrefs } from "../../hooks/useNotificationPrefs";
import type { useChannelCrud } from "../../hooks/useChannelCrud";
import type { useTypingIndicators } from "../../hooks/useTypingIndicators";
import {
  ContentArea as SharedContentArea,
  type ForumActions,
  type MessageRowActions,
  type CreateEventPayload,
  type Poll,
  type HubEvent,
  type RsvpStatus,
  type HubEmoji,
  PinnedMessagesModal,
  ConnectionStatus,
  typingForScope,
} from "@wavvon/ui";
import {
  hubFetch, getPolls, createPoll, sendAppJoin,
  pinMessage, unpinMessage, getPins, votePoll, deletePoll, fetchLinkPreview, reportMessage,
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
import { profileCardActions } from "../../platform/adminActions";

type ChannelMessagesState = ReturnType<typeof useChannelMessages>;
type DmsState = ReturnType<typeof useDms>;
type AlliancesState = ReturnType<typeof useAlliances>;
type HubLifecycleState = ReturnType<typeof useHubLifecycle>;
type HubConnectionState = ReturnType<typeof useHubConnection>;
type VoiceState = ReturnType<typeof useVoice>;
type ScreenShareState = ReturnType<typeof useScreenShare>;
type NotifyPrefsState = ReturnType<typeof useNotificationPrefs>;
type ChannelCrudState = ReturnType<typeof useChannelCrud>;
type TypingIndicatorsState = ReturnType<typeof useTypingIndicators>;

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
  createReply: (channelId, postId, body, replyToId, attachments) =>
    forumCreateReply(channelId, postId, body, replyToId, attachments),
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
  pinMessage, unpinMessage, votePoll, deletePoll, sendAppJoin, reportMessage,
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

interface TypingEntry { name: string; ts: number }

interface SlashCommandEntry {
  command: string;
  description: string;
  app_name: string;
}

// App.tsx passes whole hook-result objects here instead of ~85 flat props
// (state-access-design.md Phase 1) — the shared ContentArea's own prop
// surface (mapped explicitly below) is unchanged.
interface Props {
  channelMessages: ChannelMessagesState;
  dms: DmsState;
  alliances: AlliancesState;
  hubLifecycle: HubLifecycleState;
  hubConnection: HubConnectionState;
  voice: VoiceState;
  screenShare: ScreenShareState;
  notifyPrefs: NotifyPrefsState;
  channelCrud: ChannelCrudState;
  typing: TypingIndicatorsState;

  view: "channels" | "dms";
  channels: Channel[];
  onBreadcrumbCategoryClick: (categoryId: string) => void;
  users: User[];
  publicKey: string | null;
  blockedUsers: Set<string>;
  ignoredUsers: Set<string>;
  knownDisplayNames: Set<string>;
  myDisplayName: string | null;
  isAdmin: boolean;
  myRoles: RoleInfo[];
  memberSidebarHidden: boolean;
  onSetMemberSidebarHidden: (v: boolean) => void;
  selfInvisible: boolean;
  onSetUserContextMenu: (menu: { x: number; y: number; user: User } | null) => void;
  onOpenImage: (src: string, alt: string) => void;
  onToast: (msg: string) => void;
  slashCommands?: SlashCommandEntry[];
  canMoveMembers: boolean;
  onMoveMember: (targetPubkey: string, targetChannelId: string, eventId?: string) => void;
}

export function ContentArea(props: Props) {
  const [showPinsModal, setShowPinsModal] = useState(false);
  const {
    channelMessages, dms, alliances, hubLifecycle, hubConnection, voice, screenShare,
    notifyPrefs, channelCrud, typing,
    view, channels, onBreadcrumbCategoryClick, users, publicKey, blockedUsers, ignoredUsers,
    knownDisplayNames, myDisplayName, isAdmin, myRoles, memberSidebarHidden, onSetMemberSidebarHidden,
    selfInvisible, onSetUserContextMenu, onToast, slashCommands, canMoveMembers, onMoveMember,
  } = props;
  const { selectedChannel } = channelMessages;

  // Both sources keep their own rolling counters; this only samples them.
  const conn = useConnectionStats(
    () => {
      try { return activeSession().ws?.connectionStats() ?? null; } catch { return null; }
    },
    () => voice.voiceSessionRef.current?.inboundLossPercent() ?? null,
    () => {
      try { return activeSession().ws?.outboundLossPercent() ?? null; } catch { return null; }
    },
  );
  const { selectedConversation } = dms;

  // Scoped down from the raw typing maps to just this channel/conversation's
  // entries — moved in from App.tsx, whose only reason to compute it was
  // feeding this exact prop.
  const typingByKey = useMemo(
    () => typingForScope(typing.typingByKey, selectedChannel?.id),
    [typing.typingByKey, selectedChannel],
  );

  const dmTypingByKey = useMemo(
    () => typingForScope(typing.dmTypingByKey, selectedConversation?.id),
    [typing.dmTypingByKey, selectedConversation],
  );

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
        view={view}
        activeHubId={hubLifecycle.activeHubId}
        hubs={hubLifecycle.hubs}
        channels={channels}
        onBreadcrumbCategoryClick={onBreadcrumbCategoryClick}
        selectedChannel={selectedChannel}
        selectedConversation={selectedConversation}
        selectedAllianceChannel={alliances.selectedAllianceChannel}
        messages={channelMessages.messages}
        searchResults={channelMessages.searchResults}
        searchOpen={channelMessages.searchOpen}
        searchQuery={channelMessages.searchQuery}
        dmMessages={dms.dmMessages}
        allianceMessages={alliances.allianceMessages}
        users={users}
        publicKey={publicKey}
        blockedUsers={blockedUsers}
        ignoredUsers={ignoredUsers}
        knownDisplayNames={knownDisplayNames}
        myDisplayName={myDisplayName}
        isAdmin={isAdmin}
        myRoles={myRoles}
        editingMessageId={channelMessages.editingMessageId}
        editingDraft={channelMessages.editingDraft}
        replyTarget={channelMessages.replyTarget}
        pendingAttachments={channelMessages.pendingAttachments}
        stickToBottom={channelMessages.stickToBottom}
        newWhileScrolledUp={channelMessages.newWhileScrolledUp}
        hubConnected={hubConnection.hubConnected}
        reconnectingHubs={hubConnection.reconnectingHubs}
        memberSidebarHidden={memberSidebarHidden}
        voiceActiveUsers={voice.voiceActiveUsers}
        connectionStatus={
          <ConnectionStatus
            rttMs={conn.rttMs}
            jitterMs={conn.jitterMs}
            inboundLossPercent={conn.inboundLossPercent}
            outboundLossPercent={conn.outboundLossPercent}
            connected={
              hubLifecycle.activeHubId
                ? hubConnection.hubConnected[hubLifecycle.activeHubId] !== false
                : false
            }
          />
        }
        selfInvisible={selfInvisible}
        hideBirthdays={notifyPrefs.hideBirthdays}
        inputText={channelMessages.inputText}
        typingByKey={typingByKey}
        dmTypingByKey={dmTypingByKey}
        messagesEndRef={channelMessages.messagesEndRef}
        messagesEndChannelRef={channelMessages.messagesEndChannelRef}
        messagesContainerRef={channelMessages.messagesContainerRef}
        messageInputRef={channelMessages.messageInputRef}
        onReconnect={() => {}}
        onToggleReaction={channelMessages.handleToggleReaction}
        onSetReplyTarget={channelMessages.setReplyTarget}
        onSaveEdit={channelMessages.handleSaveEdit}
        onCancelEdit={channelMessages.handleCancelEdit}
        onStartEdit={channelMessages.handleStartEdit}
        onDeleteMessage={channelMessages.handleDeleteMessage}
        onSend={channelMessages.handleSend}
        onSendDm={dms.handleSendDm}
        onSendAllianceMessage={() => void channelMessages.handleSendAllianceMessage()}
        onPingTyping={typing.pingTyping}
        onPingDmTyping={typing.pingDmTyping}
        onSetPendingAttachments={channelMessages.setPendingAttachments}
        onAttachFiles={() => {}}
        onOpenEditDescription={(ch) => { channelCrud.setEditDescChannel(ch); channelCrud.setEditDescValue(ch.description ?? ""); }}
        firstNotifyingMessageId={channelMessages.firstNotifyingMessageId}
        onClearFirstNotify={() => channelMessages.setFirstNotifyingMessageId(null)}
        onScrollToMessage={channelMessages.handleScrollToMessage}
        onSetMemberSidebarHidden={onSetMemberSidebarHidden}
        onSetSearchOpen={channelMessages.setSearchOpen}
        onSetSearchQuery={channelMessages.setSearchQuery}
        onCloseSearch={channelMessages.handleCloseSearch}
        onJumpToBottom={channelMessages.handleJumpToBottom}
        onMessagesScroll={channelMessages.handleMessagesScroll}
        onSetUserContextMenu={onSetUserContextMenu}
        onSetEditingDraft={channelMessages.setEditingDraft}
        onInputTextChange={channelMessages.handleInputTextChange}
        onKeyDown={channelMessages.handleKeyDown}
        onOpenImage={props.onOpenImage}
        onToast={onToast}
        onError={(msg) => onToast(typeof msg === "string" ? msg : String((msg as Record<string, unknown>).message ?? msg))}
        slashCommands={slashCommands}
        activeScreenShares={screenShare.activeScreenShares}
        screenShareViewerRef={screenShare.screenShareViewerRef}
        onOpenHubStreams={screenShare.handleOpenHubStreams}
        onStartConversation={dms.handleStartConversation}
        profileCardActions={profileCardActions}
        forumActions={forumActions}
        messageRowActions={messageRowActions}
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
          channels, users, voicePartByChannel: voice.voicePartByChannel, canMoveMembers, onMoveMember,
          getEvent, getEventAssignments, getEventRsvps, createEventSquadRooms,
        }}
        onShowPinned={() => setShowPinsModal(true)}
      />

      {showPinsModal && selectedChannel && (
        <PinnedMessagesModal
          channelName={selectedChannel.name}
          canUnpin={isAdmin}
          getPins={() => getPins(selectedChannel.id)}
          unpinMessage={(messageId) => unpinMessage(selectedChannel.id, messageId)}
          onClose={() => setShowPinsModal(false)}
          onScrollToMessage={channelMessages.handleScrollToMessage}
        />
      )}
    </>
  );
}
