import React, { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
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
} from "../types";
import { UserListGrouped } from "./UserListGrouped";
import { BotCard } from "./BotCard";
import { ScreenShareViewer } from "./ScreenShareViewer";
import type { ScreenShareViewerRef } from "./ScreenShareViewer";
import { DmView } from "./content/DmView";
import { ForumView } from "./content/ForumView";
import { ChannelHeader } from "./content/ChannelHeader";
import { ChannelMessageList } from "./content/ChannelMessageList";
import { ChannelComposer } from "./content/ChannelComposer";
import { AllianceView, ReconnectBanner } from "@wavvon/ui";

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
  theme: string;
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
  ignoredUsers?: Set<string>;
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
  voiceChannelId: string | null;
  onVoiceJoin: () => void;
  onVoiceLeave: () => void;
  myAvatar?: string | null;
  inputText: string;
  typingByKey: Record<string, TypingEntry>;
  dmTypingByKey: Record<string, TypingEntry>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
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
  sharing: boolean;
  shareKbps: number;
  onStopShare: () => void;
  onComponentInteract?: (messageId: string, customId: string, values: string[]) => void;
}

export function ContentArea({
  view, activeHubId, hubs, theme,
  selectedChannel, selectedConversation, selectedAllianceChannel,
  messages, searchResults, searchOpen, searchQuery,
  dmMessages, allianceMessages,
  users, publicKey, blockedUsers, ignoredUsers = new Set<string>(), knownDisplayNames, myDisplayName,
  isAdmin, myRoles, editingMessageId, editingDraft, replyTarget,
  pendingAttachments, stickToBottom, newWhileScrolledUp,
  hubConnected, reconnectingHubs, memberSidebarHidden, voiceActiveUsers, voiceChannelId, onVoiceJoin, onVoiceLeave,
  myAvatar = null,
  inputText, typingByKey, dmTypingByKey,
  messagesEndRef, messagesContainerRef, messageInputRef,
  onReconnect, onToggleReaction, onSetReplyTarget,
  onSaveEdit, onCancelEdit, onStartEdit, onDeleteMessage,
  onSend, onSendDm, onSendAllianceMessage,
  onPingTyping, onPingDmTyping,
  onSetPendingAttachments, onAttachFiles,
  onOpenEditDescription, firstNotifyingMessageId, onClearFirstNotify, onScrollToMessage,
  onSetMemberSidebarHidden, onSetSearchOpen, onSetSearchQuery, onCloseSearch,
  onJumpToBottom, onMessagesScroll,
  onSetUserContextMenu, onSetEditingDraft, onInputTextChange, onKeyDown,
  onOpenImage, onToast, onError,
  slashCommands = [],
  activeScreenShares, screenShareViewerRef,
  sharing, shareKbps, onStopShare,
  onComponentInteract,
}: Props) {
  const [slashSuggestions, setSlashSuggestions] = useState<SlashCommandEntry[]>([]);
  const [slashSelectedIdx, setSlashSelectedIdx] = useState(0);
  const [botCard, setBotCard] = useState<{ pubkey: string; rect: DOMRect } | null>(null);
  const [focusedMessageIndex, setFocusedMessageIndex] = useState<number>(-1);
  const messageRowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAnnouncementsRef = useRef<string[]>([]);

  useEffect(() => {
    if (document.hidden) return;
    const latestMsg = messages[messages.length - 1];
    if (!latestMsg) return;
    pendingAnnouncementsRef.current.push(`${latestMsg.sender_name ?? 'Unknown'}: ${latestMsg.content}`);
    if (announceTimerRef.current) return;
    announceTimerRef.current = setTimeout(() => {
      const batch = pendingAnnouncementsRef.current.splice(0);
      if (batch.length === 1) {
        setLiveAnnouncement(batch[0]);
      } else {
        setLiveAnnouncement(`${batch.length} new messages`);
      }
      announceTimerRef.current = null;
    }, 2000);
  }, [messages]);

  const openBotCard = useCallback((pubkey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setBotCard({ pubkey, rect });
  }, []);

  const activeHub = hubs.find((h) => h.hub_id === activeHubId);

  function handleComponentInteract(messageId: string, customId: string, values: string[]) {
    if (onComponentInteract) {
      onComponentInteract(messageId, customId, values);
    } else {
      const hubUrl = activeHub?.hub_url ?? "";
      invoke("send_component_interaction", { hubUrl, messageId, customId, values }).catch(() => {});
    }
  }

  function handleSlashInputChange(value: string) {
    onInputTextChange(value);
    if (value.startsWith("/") && !value.includes(" ")) {
      const prefix = value.slice(1).toLowerCase();
      const matches = slashCommands.filter((s) =>
        s.command.toLowerCase().startsWith(prefix)
      );
      setSlashSuggestions(matches);
      setSlashSelectedIdx(0);
    } else {
      setSlashSuggestions([]);
    }
  }

  function fillSlashCommand(command: string) {
    onInputTextChange("/" + command + " ");
    setSlashSuggestions([]);
    setSlashSelectedIdx(0);
  }

  function handleMessageKeyDown(e: React.KeyboardEvent<HTMLDivElement>, index: number, displayedMessages: typeof messages) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(index + 1, displayedMessages.length - 1);
      setFocusedMessageIndex(next);
      messageRowRefs.current[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(index - 1, 0);
      setFocusedMessageIndex(prev);
      messageRowRefs.current[prev]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setFocusedMessageIndex(-1);
      messageInputRef.current?.focus();
    }
  }

  function handleSlashKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (slashSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashSelectedIdx((i) => (i + 1) % slashSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashSelectedIdx((i) => (i - 1 + slashSuggestions.length) % slashSuggestions.length);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        fillSlashCommand(slashSuggestions[slashSelectedIdx].command);
        return;
      }
      if (e.key === "Escape") {
        setSlashSuggestions([]);
        return;
      }
    }
    if (e.key === "Escape" && replyTarget) {
      e.preventDefault();
      onSetReplyTarget(null);
      return;
    }
    onKeyDown(e);
  }

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-relevant="additions"
        className="sr-only"
      >
        {liveAnnouncement}
      </div>
      <main className="content">
        {activeHubId && hubConnected[activeHubId] === false && (
          <ReconnectBanner
            reconnecting={!!reconnectingHubs[activeHubId]}
            onReconnect={onReconnect}
          />
        )}

        {view === "dms" ? (
          selectedConversation ? (
            <DmView
              selectedConversation={selectedConversation}
              dmMessages={dmMessages}
              publicKey={publicKey}
              blockedUsers={blockedUsers}
              users={users}
              knownDisplayNames={knownDisplayNames}
              myDisplayName={myDisplayName}
              pendingAttachments={pendingAttachments}
              inputText={inputText}
              dmTypingByKey={dmTypingByKey}
              messagesEndRef={messagesEndRef}
              onSetPendingAttachments={onSetPendingAttachments}
              onAttachFiles={onAttachFiles}
              onInputTextChange={onInputTextChange}
              onPingDmTyping={onPingDmTyping}
              onSendDm={onSendDm}
              onOpenImage={onOpenImage}
            />
          ) : (
            <div className="no-channel"><p>Select a conversation</p></div>
          )
        ) : selectedChannel && selectedChannel.channel_type === "forum" ? (
          <ForumView
            selectedChannel={selectedChannel}
            activeHubUrl={activeHub?.hub_url ?? ""}
            myRoles={myRoles}
            myPubkey={publicKey}
          />
        ) : selectedChannel ? (
          <>
            <ChannelHeader
              selectedChannel={selectedChannel}
              voiceChannelId={voiceChannelId}
              memberSidebarHidden={memberSidebarHidden}
              searchOpen={searchOpen}
              searchQuery={searchQuery}
              searchResults={searchResults}
              activeScreenShares={activeScreenShares}
              screenShareViewerRef={screenShareViewerRef}
              sharing={sharing}
              shareKbps={shareKbps}
              isAdmin={isAdmin}
              onVoiceJoin={onVoiceJoin}
              onVoiceLeave={onVoiceLeave}
              onToggleSearch={() => searchOpen ? onCloseSearch() : onSetSearchOpen(true)}
              onCloseSearch={onCloseSearch}
              onSetSearchQuery={onSetSearchQuery}
              onToggleMemberSidebar={() => onSetMemberSidebarHidden(!memberSidebarHidden)}
              onOpenEditDescription={onOpenEditDescription}
              onStopShare={onStopShare}
            />
            <ChannelMessageList
              selectedChannelName={selectedChannel.name}
              selectedChannelDescription={selectedChannel.description}
              messages={messages}
              searchResults={searchResults}
              blockedUsers={blockedUsers}
              ignoredUsers={ignoredUsers}
              publicKey={publicKey}
              myDisplayName={myDisplayName}
              myRoles={myRoles}
              users={users}
              knownDisplayNames={knownDisplayNames}
              editingMessageId={editingMessageId}
              editingDraft={editingDraft}
              focusedMessageIndex={focusedMessageIndex}
              activeHub={activeHub}
              hubs={hubs}
              activeHubId={activeHubId}
              isAdmin={isAdmin}
              stickToBottom={stickToBottom}
              newWhileScrolledUp={newWhileScrolledUp}
              firstNotifyingMessageId={firstNotifyingMessageId}
              typingByKey={typingByKey}
              messagesContainerRef={messagesContainerRef}
              messagesEndRef={messagesEndRef}
              messageRowRefs={messageRowRefs}
              onToggleReaction={onToggleReaction}
              onSetReplyTarget={onSetReplyTarget}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onStartEdit={onStartEdit}
              onDeleteMessage={onDeleteMessage}
              onSetEditingDraft={onSetEditingDraft}
              onScrollToMessage={onScrollToMessage}
              onToast={onToast}
              onError={onError}
              onOpenImage={onOpenImage}
              onOpenBotCard={openBotCard}
              onMessagesScroll={onMessagesScroll}
              onJumpToBottom={onJumpToBottom}
              onClearFirstNotify={onClearFirstNotify}
              onMessageKeyDown={handleMessageKeyDown}
              onComponentInteract={handleComponentInteract}
            />
            <ChannelComposer
              channelName={selectedChannel.name}
              inputText={inputText}
              replyTarget={replyTarget}
              pendingAttachments={pendingAttachments}
              users={users}
              publicKey={publicKey}
              slashSuggestions={slashSuggestions}
              slashSelectedIdx={slashSelectedIdx}
              messageInputRef={messageInputRef}
              onInputTextChange={handleSlashInputChange}
              onKeyDown={handleSlashKeyDown}
              onSend={onSend}
              onPingTyping={onPingTyping}
              onAttachFiles={onAttachFiles}
              onSetPendingAttachments={onSetPendingAttachments}
              onSetReplyTarget={onSetReplyTarget}
              onFillSlashCommand={fillSlashCommand}
            />
          </>
        ) : selectedAllianceChannel ? (
          <AllianceView
            selectedAllianceChannel={selectedAllianceChannel}
            allianceMessages={allianceMessages}
            inputText={inputText}
            knownDisplayNames={knownDisplayNames}
            myDisplayName={myDisplayName}
            onInputTextChange={onInputTextChange}
            onSendAllianceMessage={onSendAllianceMessage}
            onOpenImage={onOpenImage}
          />
        ) : (
          <div className="no-channel"><p>Select a channel to start chatting</p></div>
        )}
      </main>

      {view === "channels" && !memberSidebarHidden && (
        <aside className="user-list-sidebar" aria-label="Members">
          <UserListGrouped
            users={users}
            inVoice={voiceActiveUsers}
            onContextMenu={(e, u) => {
              e.preventDefault();
              onSetUserContextMenu({ x: e.clientX, y: e.clientY, user: u });
            }}
            onBotClick={(pubkey, e) => openBotCard(pubkey, e)}
          />
        </aside>
      )}

      {botCard && activeHub && (
        <BotCard
          pubkey={botCard.pubkey}
          hubUrl={activeHub.hub_url}
          anchorRect={botCard.rect}
          onClose={() => setBotCard(null)}
        />
      )}

    </>
  );
}
