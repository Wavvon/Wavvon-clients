import React, { createElement, useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { Message, User, RoleInfo, Hub, Poll } from "../../types";
import { MessageRow, type MessageRowActions } from "./MessageRow";
import type { StickerActions } from "../stickers/stickerActions";
import { TypingIndicator } from "../TypingIndicator";
import { WaveIcon } from "../Icons";

type HubEmojiEntry = { id: string; name: string; url: string };

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
  focusedMessageIndex: number;
  expandedThreads: Set<string>;
  threadReplies: Record<string, Message[]>;
  hubs: Hub[];
  activeHubId: string | null;
  isAdmin: boolean;
  pinnedMessageIds?: Set<string>;
  sessionHubUrl: string | null;
  sessionToken?: string | null;
  hideBirthdays?: boolean;
  hubEmojiMap: Map<string, HubEmojiEntry>;
  hubBaseUrl?: string;
  actions: MessageRowActions;
  stickerActions?: StickerActions;
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
  onAuthorClick: (pubkey: string, e?: React.MouseEvent) => void;
  onAuthorContextMenu: (e: React.MouseEvent, pubkey: string, fallbackName: string | null) => void;
  onPinToggle?: (messageId: string, isPinned: boolean) => void;
  onMessagesScroll: () => void;
  onJumpToBottom: () => void;
  onClearFirstNotify: () => void;
  firstUnreadId?: string | null;
  onMarkRead?: () => void;
  onMessageKeyDown: (e: React.KeyboardEvent<HTMLLIElement>, index: number, displayedMessages: Message[]) => void;
  onComponentInteract: (messageId: string, customId: string, values: string[]) => void;
  channelPolls?: Poll[];
  onPollUpdate?: (poll: Poll) => void;
  onPollDelete?: (pollId: string) => void;
}

// Anything open over the channel that an Esc would close first.
const OVERLAY_SELECTOR = [
  ".modal-overlay", ".context-menu-overlay", ".reaction-picker-overlay", ".settings-modal-overlay",
  ".screen-share-picker-overlay", ".hub-drawer-overlay", ".hub-folder-backdrop", ".game-modal-overlay",
  ".camera-preview-overlay", ".hub-dropdown", '[role="dialog"]', '[role="menu"]', '[role="listbox"]',
].join(", ");

const tipComponents = {
  strong: createElement("strong"),
  kbd: createElement("kbd"),
  code: createElement("code"),
};

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
  focusedMessageIndex,
  expandedThreads,
  threadReplies,
  hubs,
  activeHubId,
  isAdmin,
  pinnedMessageIds,
  sessionHubUrl,
  sessionToken,
  hideBirthdays,
  hubEmojiMap,
  hubBaseUrl,
  actions,
  stickerActions,
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
  onAuthorClick,
  onAuthorContextMenu,
  onPinToggle,
  onMessagesScroll,
  onJumpToBottom,
  onClearFirstNotify,
  firstUnreadId,
  onMarkRead,
  onMessageKeyDown,
  onComponentInteract,
  channelPolls = [],
  onPollUpdate,
  onPollDelete,
}: Props) {
  const { t } = useTranslation();
  const displayedMessages = (searchResults ?? messages).filter((msg) => !blockedUsers.has(msg.sender));
  const dividerIndex = firstUnreadId && searchResults === null
    ? displayedMessages.findIndex((m) => m.id === firstUnreadId)
    : -1;
  const dividerRef = useRef<HTMLLIElement | null>(null);
  const [dividerAbove, setDividerAbove] = useState(false);
  const hasDivider = dividerIndex >= 0;

  // Open at the divider, not the bottom. A frame later, so it lands after the
  // app's own scroll-to-newest for the same load.
  useEffect(() => {
    if (!hasDivider) return;
    const frame = requestAnimationFrame(() => dividerRef.current?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [firstUnreadId, hasDivider]);

  useEffect(() => {
    const el = dividerRef.current;
    const root = messagesContainerRef.current;
    if (!hasDivider || !el || !root) { setDividerAbove(false); return; }
    const io = new IntersectionObserver(([e]) => {
      setDividerAbove(!e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 0));
    }, { root });
    io.observe(el);
    return () => io.disconnect();
  }, [firstUnreadId, hasDivider, messagesContainerRef]);

  // Esc marks read only when nothing else took it. An overlay's own Esc
  // handler closes it and rarely says so, so two checks: whether an overlay
  // was open when the key went down (capture phase, before any handler has
  // removed it), and whether a handler prevented the default by the time
  // every listener has run.
  useEffect(() => {
    if (!hasDivider || !onMarkRead) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || document.querySelector(OVERLAY_SELECTOR)) return;
      timer = setTimeout(() => { if (!e.defaultPrevented) onMarkRead?.(); });
    }
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); clearTimeout(timer); };
  }, [hasDivider, onMarkRead]);

  return (
    <>
      <ol aria-label={t("message.actions.aria")} className="messages" ref={messagesContainerRef} onScroll={onMessagesScroll}>
        {hasDivider && dividerAbove && (
          <li className="new-messages-bar" role="status">
            <div className="new-messages-bar-pill">
            <span>{t("message.unread.bar", { count: displayedMessages.length - dividerIndex })}</span>
            <button className="btn-small" onClick={() => dividerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              {t("message.unread.jump")}
            </button>
            {onMarkRead && (
              <button className="btn-small" onClick={onMarkRead}>
                {t("message.unread.mark_read")}
              </button>
            )}
            </div>
          </li>
        )}
        {displayedMessages.length === 0 && (
          <li className="channel-empty">
            {searchResults !== null ? (
              <p>{t("channel.empty.no_search")}</p>
            ) : (
              <>
                <div className="channel-empty-icon"><WaveIcon size={28} /></div>
                <h2>{t("channel.empty.welcome", { channel: selectedChannelName })}</h2>
                <p>
                  {selectedChannelDescription
                    ? selectedChannelDescription
                    : t("channel.start_hint")}
                </p>
                <ul className="channel-empty-tips">
                  {/* hint-fine / hint-coarse: CSS picks mouse-and-keyboard or touch wording. */}
                  <li className="hint-fine"><Trans i18nKey="channel.empty.tip_voice" components={tipComponents} /></li>
                  <li className="hint-coarse"><Trans i18nKey="channel.empty.tip_voice_touch" components={tipComponents} /></li>
                  <li className="hint-fine"><Trans i18nKey="channel.empty.tip_drag" components={tipComponents} /></li>
                  <li className="hint-coarse"><Trans i18nKey="channel.empty.tip_attach_touch" components={tipComponents} /></li>
                  <li><Trans i18nKey="channel.empty.tip_mentions" components={tipComponents} /></li>
                  <li className="hint-fine"><Trans i18nKey="channel.empty.tip_jump" components={tipComponents} /></li>
                </ul>
              </>
            )}
          </li>
        )}
        {displayedMessages.map((m, i, arr) => (
          <React.Fragment key={m.id}>
          {i === dividerIndex && (
            <li ref={dividerRef} className="day-separator new-messages-divider" role="separator">
              <span className="day-separator-label">{t("message.unread.divider")}</span>
            </li>
          )}
          <MessageRow
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
            focusedMessageIndex={focusedMessageIndex}
            expandedThreads={expandedThreads}
            threadReplies={threadReplies}
            hubs={hubs}
            activeHubId={activeHubId}
            isAdmin={isAdmin}
            pinnedMessageIds={pinnedMessageIds}
            sessionHubUrl={sessionHubUrl}
            sessionToken={sessionToken}
            hideBirthdays={hideBirthdays}
            hubEmojiMap={hubEmojiMap}
            hubBaseUrl={hubBaseUrl}
            actions={actions}
            stickerActions={stickerActions}
            displayedMessages={displayedMessages}
            channelPolls={channelPolls}
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
            onAuthorClick={onAuthorClick}
            onAuthorContextMenu={onAuthorContextMenu}
            onPinToggle={onPinToggle}
            onMessageKeyDown={onMessageKeyDown}
            onComponentInteract={onComponentInteract}
            onPollUpdate={(poll) => onPollUpdate?.(poll)}
            onPollDelete={(pollId) => onPollDelete?.(pollId)}
          />
          </React.Fragment>
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
