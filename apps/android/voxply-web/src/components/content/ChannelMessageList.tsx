import React from "react";
import type { Message, User, RoleInfo, Hub } from "../../types";
import { TypingIndicator } from "../TypingIndicator";
import { MessageRow } from "./MessageRow";

type TypingEntry = { name: string; ts: number };

interface Props {
  selectedChannelName: string;
  selectedChannelDescription: string | null | undefined;
  messages: Message[];
  searchResults: Message[] | null;
  blockedUsers: Set<string>;
  publicKey: string | null;
  myDisplayName: string | null;
  myRoles: RoleInfo[];
  users: User[];
  knownDisplayNames: Set<string>;
  editingMessageId: string | null;
  editingDraft: string;
  expandedThreads: Set<string>;
  threadReplies: Record<string, Message[]>;
  hubs: Hub[];
  activeHubId: string | null;
  isAdmin: boolean;
  stickToBottom: boolean;
  newWhileScrolledUp: number;
  firstNotifyingMessageId: string | null;
  typingByKey: Record<string, TypingEntry>;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onSetReplyTarget: (message: Message | null) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: (message: Message) => void;
  onDeleteMessage: (messageId: string) => void;
  onSetEditingDraft: (v: string) => void;
  onScrollToMessage: (id: string) => void;
  onToast: (msg: string) => void;
  onError: (msg: string) => void;
  onToggleThread: (messageId: string) => void;
  onOpenImage: (src: string, alt: string) => void;
  onOpenBotCard: (pubkey: string, e: React.MouseEvent) => void;
  onMessagesScroll: () => void;
  onJumpToBottom: () => void;
  onClearFirstNotify: () => void;
  onComponentInteract: (messageId: string, customId: string, values: string[]) => void;
}

export function ChannelMessageList({
  selectedChannelName,
  selectedChannelDescription,
  messages,
  searchResults,
  blockedUsers,
  publicKey,
  myDisplayName,
  myRoles,
  users,
  knownDisplayNames,
  editingMessageId,
  editingDraft,
  expandedThreads,
  threadReplies,
  hubs,
  activeHubId,
  isAdmin,
  stickToBottom,
  newWhileScrolledUp,
  firstNotifyingMessageId,
  typingByKey,
  messagesContainerRef,
  messagesEndRef,
  onToggleReaction,
  onSetReplyTarget,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onDeleteMessage,
  onSetEditingDraft,
  onScrollToMessage,
  onToast,
  onError,
  onToggleThread,
  onOpenImage,
  onOpenBotCard,
  onMessagesScroll,
  onJumpToBottom,
  onClearFirstNotify,
  onComponentInteract,
}: Props) {
  const displayedMessages = (searchResults ?? messages).filter((msg) => !blockedUsers.has(msg.sender));

  return (
    <>
      <div className="messages" role="list" aria-label="Messages" ref={messagesContainerRef} onScroll={onMessagesScroll}>
        {(searchResults ?? messages).length === 0 && (
          <div className="channel-empty">
            {searchResults !== null ? (
              <p>No messages match your search.</p>
            ) : (
              <>
                <div className="channel-empty-icon">👋</div>
                <h2>Welcome to #{selectedChannelName}</h2>
                <p>
                  {selectedChannelDescription
                    ? selectedChannelDescription
                    : "This is the start of the channel — say hello!"}
                </p>
                <ul className="channel-empty-tips">
                  <li>Click <strong>Join Voice</strong> in the header to start a voice session here — or double-click any channel in the sidebar.</li>
                  <li><strong>Drag a file</strong> into the message area to share it (up to 3 MB).</li>
                  <li>
                    Type <code>@name</code> to mention someone,{" "}
                    <code>/me</code> for an action, or paste a code block with <code>```</code>.
                  </li>
                  <li>Press <kbd>Ctrl</kbd>+<kbd>K</kbd> to jump to another channel from anywhere.</li>
                </ul>
              </>
            )}
          </div>
        )}
        {displayedMessages.map((m, i, arr) => (
          <MessageRow
            key={m.id}
            message={m}
            index={i}
            prevMessage={arr[i - 1]}
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
            displayedMessages={displayedMessages}
            messageRowRef={() => {}}
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
            onToggleThread={onToggleThread}
            onOpenImage={onOpenImage}
            onOpenBotCard={onOpenBotCard}
            onComponentInteract={onComponentInteract}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
      {firstNotifyingMessageId &&
        messages.some((m) => m.id === firstNotifyingMessageId) && (
        <button
          className="jump-to-bottom jump-to-notification"
          onClick={() => {
            onScrollToMessage(firstNotifyingMessageId);
            onClearFirstNotify();
          }}
        >
          ↑ Jump to first notification
        </button>
      )}
      {!stickToBottom && newWhileScrolledUp > 0 && (
        <button className="jump-to-bottom" onClick={onJumpToBottom}>
          ↓ {newWhileScrolledUp} new
        </button>
      )}
      <TypingIndicator typers={Object.values(typingByKey)} />
    </>
  );
}
