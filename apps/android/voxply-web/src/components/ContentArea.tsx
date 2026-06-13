import React, { useState, useCallback, useEffect, useRef } from "react";
import { hubFetch } from "@platform";
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
import { ScreenShareViewer } from "./ScreenShareViewer";
import type { ScreenShareViewerRef } from "./ScreenShareViewer";
import { UserListGrouped } from "./UserListGrouped";
import { BotCard } from "./BotCard";
import { DmView } from "./content/DmView";
import { ChannelHeader } from "./content/ChannelHeader";
import { ChannelMessageList } from "./content/ChannelMessageList";
import { ChannelComposer } from "./content/ChannelComposer";
import { AllianceView, ReconnectBanner } from "@voxply/ui";

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
  voiceChannelId?: string | null;
  onVoiceJoin?: () => void;
  onVoiceLeave?: () => void;
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
  sharing?: boolean;
  shareKbps?: number;
  onStopShare?: () => void;
}

export function ContentArea({
  view, activeHubId, hubs, theme,
  selectedChannel, selectedConversation, selectedAllianceChannel,
  messages, searchResults, searchOpen, searchQuery,
  dmMessages, allianceMessages,
  users, publicKey, blockedUsers, knownDisplayNames, myDisplayName,
  isAdmin, myRoles, editingMessageId, editingDraft, replyTarget,
  pendingAttachments, stickToBottom, newWhileScrolledUp,
  hubConnected, reconnectingHubs, memberSidebarHidden, voiceActiveUsers, voiceChannelId, onVoiceJoin, onVoiceLeave,
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
}: Props) {
  const [slashSuggestions, setSlashSuggestions] = useState<SlashCommandEntry[]>([]);
  const [slashSelectedIdx, setSlashSelectedIdx] = useState(0);
  const [botCard, setBotCard] = useState<{ pubkey: string; rect: DOMRect } | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [threadReplies, setThreadReplies] = useState<Record<string, Message[]>>({});

  const openBotCard = useCallback((pubkey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setBotCard({ pubkey, rect });
  }, []);

  useEffect(() => {
    if (!selectedChannel) return;
    try {
      const raw = localStorage.getItem(`voxply.threads.${selectedChannel.id}`);
      const ids: string[] = raw ? JSON.parse(raw) : [];
      setExpandedThreads(new Set(ids));
    } catch {
      setExpandedThreads(new Set());
    }
  }, [selectedChannel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function persistExpandedThreads(next: Set<string>) {
    if (!selectedChannel) return;
    try {
      localStorage.setItem(`voxply.threads.${selectedChannel.id}`, JSON.stringify([...next]));
    } catch {}
  }

  async function toggleThread(messageId: string) {
    if (!selectedChannel) return;
    const next = new Set(expandedThreads);
    if (next.has(messageId)) {
      next.delete(messageId);
    } else {
      next.add(messageId);
      if (!threadReplies[messageId]) {
        try {
          const res = await hubFetch(`/channels/${selectedChannel.id}/messages?thread_root=${messageId}`);
          const replies = await res.json() as Message[];
          setThreadReplies((prev) => ({ ...prev, [messageId]: Array.isArray(replies) ? replies : [] }));
        } catch {
          setThreadReplies((prev) => ({ ...prev, [messageId]: [] }));
        }
      }
    }
    setExpandedThreads(next);
    persistExpandedThreads(next);
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

  function handleComponentInteract(_messageId: string, _customId: string, _values: string[]) {
    // Actual WS send is handled inside MessageComponents via platform session.
  }

  const activeHub = hubs.find((h) => h.hub_id === activeHubId);

  return (
    <>
      <div className="content">
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
              publicKey={publicKey}
              myDisplayName={myDisplayName}
              myRoles={myRoles}
              users={users}
              knownDisplayNames={knownDisplayNames}
              editingMessageId={editingMessageId}
              editingDraft={editingDraft}
              expandedThreads={expandedThreads}
              threadReplies={threadReplies}
              hubs={hubs}
              activeHubId={activeHubId}
              isAdmin={isAdmin}
              stickToBottom={stickToBottom}
              newWhileScrolledUp={newWhileScrolledUp}
              firstNotifyingMessageId={firstNotifyingMessageId}
              typingByKey={typingByKey}
              messagesContainerRef={messagesContainerRef}
              messagesEndRef={messagesEndRef}
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
              onToggleThread={toggleThread}
              onOpenImage={onOpenImage}
              onOpenBotCard={openBotCard}
              onMessagesScroll={onMessagesScroll}
              onJumpToBottom={onJumpToBottom}
              onClearFirstNotify={onClearFirstNotify}
              onComponentInteract={handleComponentInteract}
            />
            <ChannelComposer
              channelName={selectedChannel.name}
              activeHubUrl={activeHub?.hub_url}
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
      </div>

      {view === "channels" && !memberSidebarHidden && (
        <aside className="user-list-sidebar">
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

      {botCard && (
        <BotCard
          pubkey={botCard.pubkey}
          anchorRect={botCard.rect}
          onClose={() => setBotCard(null)}
        />
      )}
    </>
  );
}
