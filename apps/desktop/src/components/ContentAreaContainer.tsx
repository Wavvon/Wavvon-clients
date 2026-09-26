import { HubStreamsPanel, typingForScope } from "@wavvon/ui";
import { ContentArea } from "./ContentArea";
import { saveDraft } from "../utils/drafts";
import type { Channel, User, RoleInfo } from "../types";
import type { useVoice } from "../hooks/useVoice";
import type { useHubLifecycle } from "../hooks/useHubLifecycle";
import type { useHubConnections } from "../hooks/useHubConnections";
import type { useTypingIndicators } from "../hooks/useTypingIndicators";
import type { useChannelMessages } from "../hooks/useChannelMessages";
import type { useDms } from "../hooks/useDms";
import type { useFirstNotify } from "../hooks/useFirstNotify";

interface SlashCommandEntry {
  command: string;
  description: string;
  app_name: string;
}

interface Props {
  view: "channels" | "dms";
  channels: Channel[];
  users: User[];
  publicKey: string | null;
  blockedUsers: Set<string>;
  ignoredUsers: Set<string>;
  knownDisplayNames: Set<string>;
  myDisplayName: string | null;
  isAdmin: boolean;
  myRoles: RoleInfo[];
  memberSidebarHidden: boolean;
  setMemberSidebarHidden: (v: boolean) => void;
  hideBirthdays: boolean;
  openEditDescription: (channel: Channel) => void;
  setUserContextMenu: (menu: { x: number; y: number; user: User } | null) => void;
  slashCommands?: SlashCommandEntry[];
  openImage: (src: string, alt: string) => void;
  setToast: (msg: string | null) => void;
  setError: (msg: string | null) => void;
  showHubStreams: boolean;
  setShowHubStreams: (v: boolean) => void;
  canMoveMembers: boolean;
  handleMoveMember: (targetPubkey: string, targetChannelId: string, eventId?: string) => void;

  voice: ReturnType<typeof useVoice>;
  hubLifecycle: ReturnType<typeof useHubLifecycle>;
  hubConnections: ReturnType<typeof useHubConnections>;
  typing: ReturnType<typeof useTypingIndicators>;
  channelMessages: ReturnType<typeof useChannelMessages>;
  dms: ReturnType<typeof useDms>;
  firstNotify: ReturnType<typeof useFirstNotify>;
}

// Absorbs desktop's ContentArea call site (itself an app-local wrapper
// around the shared ContentArea) the same way ChannelSidebarContainer
// absorbs the sidebar's: grouped hook-result objects replace the flat prop
// list. Also folds in the HubStreamsPanel that always renders right after
// it and reads the same groups, so App no longer threads voice/channels/users
// through a second call site for it.
export function ContentAreaContainer({
  view, channels, users, publicKey, blockedUsers, ignoredUsers,
  knownDisplayNames, myDisplayName, isAdmin, myRoles,
  memberSidebarHidden, setMemberSidebarHidden, hideBirthdays,
  openEditDescription, setUserContextMenu, slashCommands, openImage,
  setToast, setError, showHubStreams, setShowHubStreams,
  canMoveMembers, handleMoveMember,
  voice, hubLifecycle, hubConnections, typing, channelMessages, dms, firstNotify,
}: Props) {
  const { activeHubId } = hubLifecycle;
  const { selectedChannel } = channelMessages;

  return (
    <>
      <ContentArea
        view={view}
        activeHubId={activeHubId}
        hubs={hubLifecycle.hubs}
        channels={channels}
        selectedChannel={selectedChannel}
        selectedConversation={dms.selectedConversation}
        selectedAllianceChannel={channelMessages.selectedAllianceChannel}
        messages={channelMessages.messages}
        searchResults={channelMessages.searchResults}
        searchOpen={channelMessages.searchOpen}
        searchQuery={channelMessages.searchQuery}
        dmMessages={dms.dmMessages}
        allianceMessages={channelMessages.allianceMessages}
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
        hubConnected={hubConnections.hubConnected}
        reconnectingHubs={hubConnections.reconnectingHubs}
        memberSidebarHidden={memberSidebarHidden}
        voiceActiveUsers={voice.voiceActiveUsers}
        hideBirthdays={hideBirthdays}
        inputText={channelMessages.inputText}
        typingByKey={typingForScope(typing.typingByKey, selectedChannel?.id)}
        dmTypingByKey={typingForScope(typing.dmTypingByKey, dms.selectedConversation?.id)}
        messagesEndRef={channelMessages.messagesEndRef}
        messagesEndChannelRef={channelMessages.messagesEndChannelRef}
        messagesContainerRef={channelMessages.messagesContainerRef}
        messageInputRef={channelMessages.messageInputRef}
        onReconnect={hubLifecycle.handleReconnect}
        onToggleReaction={channelMessages.toggleReaction}
        onSetReplyTarget={channelMessages.setReplyTarget}
        onSaveEdit={channelMessages.handleSaveEditedMessage}
        onCancelEdit={channelMessages.cancelEditingMessage}
        onStartEdit={channelMessages.startEditingMessage}
        onDeleteMessage={channelMessages.handleDeleteMessage}
        onSend={channelMessages.handleSend}
        onSendDm={dms.handleSendDm}
        onSendAllianceMessage={channelMessages.handleSendAllianceMessage}
        onPingTyping={typing.pingTyping}
        onPingDmTyping={typing.pingDmTyping}
        onSetPendingAttachments={channelMessages.setPendingAttachments}
        onAttachFiles={channelMessages.attachFiles}
        onOpenEditDescription={openEditDescription}
        firstNotifyingMessageId={
          activeHubId && selectedChannel
            ? (firstNotify.firstNotifyId[activeHubId]?.[selectedChannel.id] ?? null)
            : null
        }
        onClearFirstNotify={() => {
          if (activeHubId && selectedChannel) firstNotify.clearFirstNotify(activeHubId, selectedChannel.id);
        }}
        onScrollToMessage={channelMessages.scrollToMessage}
        onSetMemberSidebarHidden={setMemberSidebarHidden}
        onSetSearchOpen={channelMessages.setSearchOpen}
        onSetSearchQuery={channelMessages.setSearchQuery}
        onCloseSearch={channelMessages.closeSearch}
        onJumpToBottom={channelMessages.jumpToBottom}
        onMessagesScroll={channelMessages.handleMessagesScroll}
        onSetUserContextMenu={setUserContextMenu}
        onSetEditingDraft={channelMessages.setEditingDraft}
        onInputTextChange={(v: string) => {
          channelMessages.setInputText(v);
          if (activeHubId && selectedChannel) saveDraft(`${activeHubId}/${selectedChannel.id}`, v);
        }}
        onKeyDown={channelMessages.handleKeyDown}
        slashCommands={slashCommands}
        onOpenImage={openImage}
        onToast={setToast}
        onError={setError}
        onOpenHubStreams={() => setShowHubStreams(true)}
        voicePartByChannel={voice.voicePartByChannel}
        canMoveMembers={canMoveMembers}
        onMoveMember={handleMoveMember}
        onStartConversation={(pubkey) => void dms.startDmWith(pubkey)}
      />
      {showHubStreams && (
        <HubStreamsPanel
          streams={voice.hubStreams}
          subscribedIds={voice.subscribedStreamIds.current}
          currentChannelId={selectedChannel?.id ?? null}
          channels={channels}
          nameFor={(pk) => users.find((u) => u.public_key === pk)?.display_name || pk.slice(0, 8)}
          onWatch={voice.subscribeToStream}
          onStopWatch={voice.unsubscribeFromStream}
          onClose={() => setShowHubStreams(false)}
        />
      )}
    </>
  );
}
