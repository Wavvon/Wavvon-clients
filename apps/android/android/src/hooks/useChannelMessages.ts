import { useState, useRef, useEffect } from "react";
import type { Channel, Message, Attachment } from "@shared/types";
import { getMessages, sendMessage, editMessage, deleteMessage, addReaction, removeReaction } from "@platform";

export interface ChannelMessagesParams {
  activeHubId: string | null;
  clearUnread: (hubId: string, channelId: string) => void;
}

export interface ChannelMessagesReturn {
  selectedChannel: Channel | null;
  messages: Message[];
  inputText: string;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  editingMessageId: string | null;
  editingDraft: string;
  setEditingDraft: React.Dispatch<React.SetStateAction<string>>;
  replyTarget: Message | null;
  setReplyTarget: React.Dispatch<React.SetStateAction<Message | null>>;
  pendingAttachments: Attachment[];
  setPendingAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  stickToBottom: boolean;
  setStickToBottom: React.Dispatch<React.SetStateAction<boolean>>;
  newWhileScrolledUp: number;
  setNewWhileScrolledUp: React.Dispatch<React.SetStateAction<number>>;
  searchOpen: boolean;
  setSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  searchResults: Message[] | null;
  setSearchResults: React.Dispatch<React.SetStateAction<Message[] | null>>;
  firstNotifyingMessageId: string | null;
  setFirstNotifyingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setMessagesRef: React.MutableRefObject<React.Dispatch<React.SetStateAction<Message[]>>>;
  setStickToBottomRef: React.MutableRefObject<React.Dispatch<React.SetStateAction<boolean>>>;
  setNewWhileScrolledUpRef: React.MutableRefObject<React.Dispatch<React.SetStateAction<number>>>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  messageInputRef: React.RefObject<HTMLInputElement | null>;
  handleSelectChannel: (ch: Channel) => Promise<void>;
  handleSend: () => Promise<void>;
  handleSaveEdit: () => Promise<void>;
  handleCancelEdit: () => void;
  handleStartEdit: (msg: Message) => void;
  handleDeleteMessage: (msgId: string) => Promise<void>;
  handleToggleReaction: (msgId: string, emoji: string) => Promise<void>;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export function useChannelMessages({
  activeHubId,
  clearUnread,
}: ChannelMessagesParams): ChannelMessagesReturn {
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [newWhileScrolledUp, setNewWhileScrolledUp] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Message[] | null>(null);
  const [firstNotifyingMessageId, setFirstNotifyingMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);

  // Stable setter refs so stableHandlers (memoised before this hook) can call
  // setMessages/setStickToBottom/setNewWhileScrolledUp without capturing stale closures.
  const setMessagesRef = useRef<React.Dispatch<React.SetStateAction<Message[]>>>(setMessages);
  const setStickToBottomRef = useRef<React.Dispatch<React.SetStateAction<boolean>>>(setStickToBottom);
  const setNewWhileScrolledUpRef = useRef<React.Dispatch<React.SetStateAction<number>>>(setNewWhileScrolledUp);

  useEffect(() => { setMessagesRef.current = setMessages; }, [setMessages]);
  useEffect(() => { setStickToBottomRef.current = setStickToBottom; }, [setStickToBottom]);
  useEffect(() => { setNewWhileScrolledUpRef.current = setNewWhileScrolledUp; }, [setNewWhileScrolledUp]);

  useEffect(() => {
    if (stickToBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setNewWhileScrolledUp(0);
    }
  }, [messages, stickToBottom]);

  useEffect(() => {
    if (selectedChannel) {
      setTimeout(() => messageInputRef.current?.focus(), 0);
    }
  }, [selectedChannel?.id]);

  async function handleSelectChannel(ch: Channel) {
    setSelectedChannel(ch);
    setMessages([]);
    setReplyTarget(null);
    setEditingMessageId(null);
    if (activeHubId) clearUnread(activeHubId, ch.id);
    try {
      const msgs = await getMessages(ch.id);
      setMessages(msgs);
      setStickToBottom(true);
      setNewWhileScrolledUp(0);
    } catch {}
  }

  async function handleSend() {
    if (!selectedChannel || !inputText.trim()) return;
    const text = inputText.trim();
    setInputText("");
    try {
      await sendMessage(selectedChannel.id, text, pendingAttachments.length ? pendingAttachments : undefined, replyTarget?.id);
      setPendingAttachments([]);
      setReplyTarget(null);
    } catch {}
  }

  async function handleSaveEdit() {
    if (!editingMessageId || !editingDraft.trim() || !selectedChannel) return;
    try {
      await editMessage(selectedChannel.id, editingMessageId, editingDraft.trim());
      setEditingMessageId(null);
      setEditingDraft("");
    } catch {}
  }

  function handleCancelEdit() {
    setEditingMessageId(null);
    setEditingDraft("");
  }

  function handleStartEdit(msg: Message) {
    setEditingMessageId(msg.id);
    setEditingDraft(msg.content);
  }

  async function handleDeleteMessage(msgId: string) {
    if (!selectedChannel) return;
    try {
      await deleteMessage(selectedChannel.id, msgId);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } catch {}
  }

  async function handleToggleReaction(msgId: string, emoji: string) {
    if (!selectedChannel) return;
    const msg = messages.find((m) => m.id === msgId);
    const existing = msg?.reactions?.find((r) => r.emoji === emoji);
    try {
      if (existing?.me) await removeReaction(selectedChannel.id, msgId, emoji);
      else await addReaction(selectedChannel.id, msgId, emoji);
    } catch {}
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); }
    if (e.key === "Escape") { setReplyTarget(null); setEditingMessageId(null); }
  }

  return {
    selectedChannel,
    messages,
    setMessages,
    inputText,
    setInputText,
    editingMessageId,
    editingDraft,
    setEditingDraft,
    replyTarget,
    setReplyTarget,
    pendingAttachments,
    setPendingAttachments,
    stickToBottom,
    setStickToBottom,
    newWhileScrolledUp,
    setNewWhileScrolledUp,
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    searchResults,
    setSearchResults,
    firstNotifyingMessageId,
    setFirstNotifyingMessageId,
    setMessagesRef,
    setStickToBottomRef,
    setNewWhileScrolledUpRef,
    messagesEndRef,
    messagesContainerRef,
    messageInputRef,
    handleSelectChannel,
    handleSend,
    handleSaveEdit,
    handleCancelEdit,
    handleStartEdit,
    handleDeleteMessage,
    handleToggleReaction,
    handleKeyDown,
  };
}
