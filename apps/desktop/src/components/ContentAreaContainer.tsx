import { memberActivity } from "@wavvon/ui";
import type { AllianceScrollback } from "@wavvon/ui";
import { HubStreamsPanel, liveScreenShares, typingForScope } from "@wavvon/ui";
import { ContentArea } from "./ContentArea";
import { useHubCapabilities } from "../hooks/useHubCapabilities";
import { useStickers } from "../hooks/useStickers";
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
  allianceScrollback: AllianceScrollback;
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
  allianceScrollback, view, channels, users, publicKey, blockedUsers, ignoredUsers,
  knownDisplayNames, myDisplayName, isAdmin, myRoles,
  memberSidebarHidden, setMemberSidebarHidden, hideBirthdays,
  openEditDescription, setUserContextMenu, slashCommands, openImage,
  setToast, setError, showHubStreams, setShowHubStreams,
  canMoveMembers, handleMoveMember,
  voice, hubLifecycle, hubConnections, typing, channelMessages, dms, firstNotify,
}: Props) {
  const { activeHubId } = hubLifecycle;
  const caps = useHubCapabilities(hubLifecycle.hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? null);
  const { selectedChannel } = channelMessages;
  const hasPerm = (p: string) => isAdmin || myRoles.some((r) => r.permissions?.includes(p));
  const stickerActions = useStickers({
    hub: hubLifecycle.hubs.find((h) => h.hub_id === activeHubId),
    joinedHubs: hubLifecycle.hubs,
    supported: caps.includes("stickers"),
    canManagePacks: hasPerm("stickers.packs.manage"),
    canUseExternal: hasPerm("stickers.external"),
    sendSticker: channelMessages.handleSendSticker,
  });

  return (
    <>
      <ContentArea
        view={view}
        activeHubId={activeHubId}
        hubs={hubLifecycle.hubs}
        channels={channels}
        selectedChannel={selectedChannel}
        voiceStage={selectedChannel ? {
          participants: voice.voicePartByChannel[selectedChannel.id] ?? [],
          speaking: voice.speakingPubkeys,
          avatars: new Map(users.map((u) => [u.public_key, u.avatar])),
          inThisRoom: voice.voiceChannelId === selectedChannel.id,
          onJoin: () => void voice.handleVoiceJoin(selectedChannel),
          publicKey,
          floor: voice.floor && voice.voiceChannelId === selectedChannel.id && caps.includes("voice.hands")
            ? {
                ...voice.floor,
                onLower: () => { if (publicKey) voice.floor?.onDismiss(publicKey); },
                canGrant: isAdmin || myRoles.some((r) => r.permissions.includes("moderation.mute")),
              }
            : undefined,
          live: {
            streams: voice.hubStreams.filter((s) => s.channel_id === selectedChannel.id),
            opened: voice.openedIds,
            nameFor: (pk) => users.find((u) => u.public_key === pk)?.display_name || pk.slice(0, 8),
            onOpen: (id) => voice.openStream(selectedChannel.id, id),
            onClose: (id) => voice.closeStream(selectedChannel.id, id),
          },
          selfShare: voice.sharing && voice.shareLocalStream && voice.voiceChannelId === selectedChannel.id
            ? { stream: voice.shareLocalStream, kbps: voice.shareKbps, onStop: voice.stopShare }
            : undefined,
        } : undefined}
        selectedConversation={dms.selectedConversation}
        selectedAllianceChannel={channelMessages.selectedAllianceChannel}
        messages={channelMessages.messages}
        searchResults={channelMessages.searchResults}
        searchOpen={channelMessages.searchOpen}
        searchQuery={channelMessages.searchQuery}
        dmMessages={dms.dmMessages}
        allianceMessages={channelMessages.allianceMessages}
        allianceScrollback={allianceScrollback}
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
        channelFiles={caps.includes("attachments.stored") ? channelMessages.pendingFiles : undefined}
        stickToBottom={channelMessages.stickToBottom}
        newWhileScrolledUp={channelMessages.newWhileScrolledUp}
        hubConnected={hubConnections.hubConnected}
        reconnectingHubs={hubConnections.reconnectingHubs}
        memberSidebarHidden={memberSidebarHidden}
        voiceActiveUsers={voice.speakingPubkeys}
        memberActivity={memberActivity(voice.voicePartByChannel, voice.hubStreams, (id) => channels.find((c) => c.id === id)?.name)}
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
        dmKeyChangedPeer={dms.keyChangedPeer}
        onAcceptDmKeyChange={dms.handleAcceptKeyChange}
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
        liveShareCount={liveScreenShares(voice.hubStreams).length}
        voicePartByChannel={voice.voicePartByChannel}
        canMoveMembers={canMoveMembers}
        onMoveMember={handleMoveMember}
        onStartConversation={(pubkey) => void dms.startDmWith(pubkey)}
        stickerActions={stickerActions}
      />
      {showHubStreams && (
        <HubStreamsPanel
          streams={voice.hubStreams}
          subscribedIds={voice.openedIds}
          currentChannelId={selectedChannel?.id ?? null}
          channels={channels}
          nameFor={(pk) => users.find((u) => u.public_key === pk)?.display_name || pk.slice(0, 8)}
          onWatch={voice.openStream}
          onStopWatch={voice.closeStream}
          onClose={() => setShowHubStreams(false)}
        />
      )}
    </>
  );
}
