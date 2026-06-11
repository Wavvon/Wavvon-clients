import React from "react";
import { useTranslation } from "react-i18next";
import type { Message, User, RoleInfo, Hub } from "../../types";
import { TypingIndicator } from "../TypingIndicator";
import { MessageRow } from "./MessageRow";

type HubEmojiEntry = { id: string; name: string; url: string };
type TypingEntry = { name: string; ts: number };

interface Props {
  selectedChannelName: string;
  selectedChannelDescription: string | null | undefined;
  messages: Message[];
  searchResults: Message[] | null;
  blockedUsers: Set<string>;
  ignoredUsers: Set<string>;
  publicKey: string | null;
  myDisplayName: string | null;
  myRoles: RoleInfo[];
  users: User[];
  knownDisplayNames: Set<string>;
  editingMessageId: string | null;
  editingDraft: string;
  focusedMessageIndex: number;
  activeHub: Hub | undefined;
  hubEmojiMap: Map<string, HubEmojiEntry>;
  expandedThreads: Set<string>;
  threadReplies: Record<string, Message[]>;
  hubs: Hub[];
  activeHubId: string | null;
  isAdmin: boolean;
  stickToBottom: boolean;
  newWhileScrolledUp: number;
  firstNotifyingMessageId: string | null;
  typingByKey: Record<string, TypingEntry>;
  messagesContainerRef: React.RefObject<HTMLOListElement | null>;
  messagesEndChannelRef: React.RefObject<HTMLLIElement | null>;
  messageRowRefs: React.MutableRefObject<(HTMLLIElement | null)[]>;
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
  onOpenProfileCard: (pubkey: string, e: React.MouseEvent) => void;
  onMessagesScroll: () => void;
  onJumpToBottom: () => void;
  onClearFirstNotify: () => void;
  onMessageKeyDown: (e: React.KeyboardEvent<HTMLLIElement>, index: number, displayedMessages: Message[]) => void;
  onComponentInteract: (messageId: string, customId: string, values: string[]) => void;
}

export function ChannelMessageList({
  selectedChannelName,
  selectedChannelDescription,
  messages,
  searchResults,
  blockedUsers,
  ignoredUsers,
  publicKey,
  myDisplayName,
  myRoles,
  users,
  knownDisplayNames,
  editingMessageId,
  editingDraft,
  focusedMessageIndex,
  activeHub,
  hubEmojiMap,
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
  messagesEndChannelRef,
  messageRowRefs,
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
  onOpenProfileCard,
  onMessagesScroll,
  onJumpToBottom,
  onClearFirstNotify,
  onMessageKeyDown,
  onComponentInteract,
}: Props) {
  const { t } = useTranslation();
  const displayedMessages = (searchResults ?? messages).filter((msg) => !blockedUsers.has(msg.sender));

  return (
    <>
      <ol aria-label={t("message.actions.aria")} className="messages" ref={messagesContainerRef} onScroll={onMessagesScroll}>
        {displayedMessages.length === 0 && (
          <li className="channel-empty">
            {searchResults !== null ? (
              <p>{t("channel.empty.no_search")}</p>
            ) : (
              <>
                <div className="channel-empty-icon">👋</div>
                <h2>{t("channel.empty.welcome", { channel: selectedChannelName })}</h2>
                <p>
                  {selectedChannelDescription
                    ? selectedChannelDescription
                    : "This is the start of the channel — say hello!"}
                </p>
                <ul className="channel-empty-tips">
                  <li dangerouslySetInnerHTML={{ __html: t("channel.empty.tip_voice") }} />
                  <li dangerouslySetInnerHTML={{ __html: t("channel.empty.tip_drag") }} />
                  <li dangerouslySetInnerHTML={{ __html: t("channel.empty.tip_mentions") }} />
                  <li dangerouslySetInnerHTML={{ __html: t("channel.empty.tip_jump") }} />
                </ul>
              </>
            )}
          </li>
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
            ignoredUsers={ignoredUsers}
            editingMessageId={editingMessageId}
            editingDraft={editingDraft}
            focusedMessageIndex={focusedMessageIndex}
            activeHub={activeHub}
            hubEmojiMap={hubEmojiMap}
            expandedThreads={expandedThreads}
            threadReplies={threadReplies}
            hubs={hubs}
            activeHubId={activeHubId}
            isAdmin={isAdmin}
            displayedMessages={displayedMessages}
            messageRowRef={(el) => { messageRowRefs.current[i] = el; }}
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
            onOpenProfileCard={onOpenProfileCard}
            onMessageKeyDown={onMessageKeyDown}
            onComponentInteract={onComponentInteract}
          />
        ))}
        <li ref={messagesEndChannelRef} aria-hidden="true" />
      </ol>
      {firstNotifyingMessageId &&
        messages.some((m) => m.id === firstNotifyingMessageId) && (
        <button
          className="jump-to-bottom jump-to-notification"
          onClick={() => {
            onScrollToMessage(firstNotifyingMessageId);
            onClearFirstNotify();
          }}
        >
          {t("message.jump.first_notification")}
        </button>
      )}
      {!stickToBottom && newWhileScrolledUp > 0 && (
        <button className="jump-to-bottom" onClick={onJumpToBottom}>
          {t("message.jump.bottom", { count: newWhileScrolledUp })}
        </button>
      )}
      <TypingIndicator typers={Object.values(typingByKey)} />
    </>
  );
}
