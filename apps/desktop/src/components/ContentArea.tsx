import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type React from "react";
import type {
  Channel,
  Hub,
  Message,
  DmMessage,
  Attachment,
  User,
  RoleInfo,
  RoleCategory,
  Conversation,
  AllianceSharedChannel,
  VoiceParticipant,
  LinkPreview,
  BotProfile,
  PostListResponse,
  PostDetail,
  UserProfile,
} from "../types";
import {
  ContentArea as SharedContentArea,
  type ForumActions,
  type MessageRowActions,
  type UserProfileCardActions,
  type EventStagingCapability,
  type CreateEventPayload,
  type HubEmoji,
  type Poll,
  type HubEvent,
  type RsvpStatus,
  type EventMoveAssignment,
  type EventRsvp,
} from "@wavvon/ui";
import { PinnedMessages } from "./PinnedMessages";

function domainOf(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

interface HubInfoResponse {
  welcome_label: string | null;
  welcome_invite_url: string | null;
}

function loadWelcomeInfo(hubUrl: string): Promise<HubInfoResponse> {
  return invoke<HubInfoResponse>("preview_hub_info", { url: hubUrl });
}

function dismissKey(hubId: string): string {
  return `wavvon.welcomeBannerDismissed.${hubId}`;
}

function isWelcomeDismissed(hubId: string): boolean {
  try { return localStorage.getItem(dismissKey(hubId)) === "1"; } catch { return false; }
}

function dismissWelcome(hubId: string): void {
  try { localStorage.setItem(dismissKey(hubId), "1"); } catch { /* ignore */ }
}

// Desktop has no alliance-forum access yet (federation write-proxy is a
// web-only surface so far), so the alliance-prefixed actions stay unset.
// Reply-thread pagination (the old desktop forum_get_post_replies command)
// is dropped here -- the hub never registered a GET route for
// /channels/:cid/posts/:pid/replies, so that command 404'd already.
const forumActions: ForumActions = {
  listPosts: (channelId, cursor) => invoke<PostListResponse>("forum_list_posts", { channelId, cursor }),
  getPost: (channelId, postId) => invoke<PostDetail>("forum_get_post", { channelId, postId }),
  createPost: (channelId, title, body) => invoke<{ id: string }>("forum_create_post", { channelId, title, body }),
  createReply: (channelId, postId, body, replyToId) =>
    invoke<{ id: string }>("forum_create_reply", { channelId, postId, body, replyToId }),
  // ponytail: these 8 don't have a #[tauri::command] on the Rust side yet --
  // wired against the hub's real channel/post-scoped routes so backend-engineer
  // can add forum_edit_post/forum_delete_post/forum_edit_reply/forum_delete_reply/
  // forum_add_post_reaction/forum_remove_post_reaction/forum_add_reply_reaction/
  // forum_remove_reply_reaction by mirroring forum_pin_post's pattern.
  editPost: (channelId, postId, title, body) => invoke<void>("forum_edit_post", { channelId, postId, title, body }),
  deletePost: (channelId, postId) => invoke<void>("forum_delete_post", { channelId, postId }),
  editReply: (channelId, postId, replyId, body) =>
    invoke<void>("forum_edit_reply", { channelId, postId, replyId, body }),
  deleteReply: (channelId, postId, replyId) => invoke<void>("forum_delete_reply", { channelId, postId, replyId }),
  pinPost: (channelId, postId, pin) => invoke<void>("forum_pin_post", { channelId, postId, pin }),
  lockPost: (channelId, postId, lock) => invoke<void>("forum_lock_post", { channelId, postId, lock }),
  markPostRead: (channelId, postId) => invoke<void>("mark_post_read", { channelId, postId }),
  addPostReaction: (channelId, postId, emoji) =>
    invoke<void>("forum_add_post_reaction", { channelId, postId, emoji }),
  removePostReaction: (channelId, postId, emoji) =>
    invoke<void>("forum_remove_post_reaction", { channelId, postId, emoji }),
  addReplyReaction: (channelId, postId, replyId, emoji) =>
    invoke<void>("forum_add_reply_reaction", { channelId, postId, replyId, emoji }),
  removeReplyReaction: (channelId, postId, replyId, emoji) =>
    invoke<void>("forum_remove_reply_reaction", { channelId, postId, replyId, emoji }),
};

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
  onOpenHubStreams: () => void;
  voicePartByChannel: Record<string, VoiceParticipant[]>;
  canMoveMembers: boolean;
  onMoveMember: (targetPubkey: string, targetChannelId: string, eventId?: string) => void;
}

export function ContentArea(props: Props) {
  const {
    hubs, activeHubId, channels, users, selectedChannel, isAdmin,
    voicePartByChannel, canMoveMembers, onMoveMember, onScrollToMessage,
  } = props;
  const [showPinned, setShowPinned] = useState(false);
  const activeHub = hubs.find((h) => h.hub_id === activeHubId);

  async function fetchLinkPreviewAction(hubUrl: string, url: string): Promise<LinkPreview> {
    const raw = await invoke<{ url: string; title?: string; description?: string; image_url?: string }>(
      "fetch_link_preview", { hubUrl, url },
    );
    return {
      url: raw.url,
      title: raw.title ?? null,
      description: raw.description ?? null,
      image: raw.image_url ?? null,
      domain: domainOf(raw.url),
    };
  }

  const messageRowActions: MessageRowActions = {
    pinMessage: (channelId, messageId) => invoke("pin_message", { hubUrl: activeHub?.hub_url ?? "", channelId, messageId }),
    unpinMessage: (channelId, messageId) => invoke("unpin_message", { hubUrl: activeHub?.hub_url ?? "", channelId, messageId }),
    sendBotAppJoin: (botId, channelId) => {
      invoke("send_hub_ws_raw", {
        payload: JSON.stringify({ type: "bot_app_join", bot_id: botId, channel_id: channelId }),
      }).catch(() => {});
    },
    fetchLinkPreview: fetchLinkPreviewAction,
    muteUser: (pubkey) => invoke("mute_user_cmd", { targetPublicKey: pubkey, reason: null }),
    kickUser: (pubkey) => invoke("kick_user_cmd", { targetPublicKey: pubkey, reason: null }),
    banUser: (pubkey) => invoke("ban_user_cmd", { targetPublicKey: pubkey, reason: null }),
    votePoll: (pollId, optionId) => invoke<Poll>("vote_poll", { pollId, optionIds: [optionId] }),
    deletePoll: (pollId) => invoke("delete_poll", { hubUrl: activeHub?.hub_url ?? "", pollId }),
    reportMessage: (messageId, reason) => invoke("report_message", { messageId, reason }),
  };

  const profileCardActions: UserProfileCardActions = {
    getUserProfile: (pubkey) => invoke<UserProfile>("get_user_profile", { hubUrl: activeHub?.hub_url ?? "", pubkey }),
    listRoleCategories: () => invoke<RoleCategory[]>("list_role_categories"),
    saveMyProfile: (_hubId, fields) =>
      invoke<void>("update_my_profile_on_hub", { hubUrl: activeHub?.hub_url ?? "", profile: fields }),
  };

  function loadBotProfile(pubkey: string): Promise<BotProfile> {
    return invoke<BotProfile>("get_bot_profile", { hubUrl: activeHub?.hub_url ?? "", pubkey });
  }

  function loadHubEmojis(): Promise<HubEmoji[]> {
    return invoke<HubEmoji[]>("list_hub_emojis");
  }

  function loadChannelPolls(channelId: string): Promise<Poll[]> {
    if (!activeHub) return Promise.resolve([]);
    return invoke<Poll[]>("get_channel_polls", { hubUrl: activeHub.hub_url, channelId });
  }

  function loadThreadReplies(channelId: string, messageId: string): Promise<Message[]> {
    return invoke<Message[]>("get_thread_replies", { channelId, threadRoot: messageId });
  }

  function loadExpandedThreads(channelId: string): Set<string> {
    try {
      const raw = localStorage.getItem(`wavvon.threads.${channelId}`);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  }

  function saveExpandedThreads(channelId: string, ids: Set<string>): void {
    localStorage.setItem(`wavvon.threads.${channelId}`, JSON.stringify([...ids]));
  }

  function handleComponentInteract(messageId: string, customId: string, values: string[]) {
    const hubUrl = activeHub?.hub_url ?? "";
    invoke("send_component_interaction", { hubUrl, messageId, customId, values }).catch(() => {});
  }

  async function onCreatePoll(channelId: string, question: string, options: string[]): Promise<Poll> {
    const raw = await invoke<{
      id: string; channel_id: string; creator_pubkey: string; question: string;
      options: string; ends_at: number | null; created_at: number;
    }>("create_poll", { hubUrl: activeHub?.hub_url ?? "", channelId, question, options, closesAt: null });
    const rawOptions: Array<{ id: string; text: string }> = JSON.parse(raw.options);
    return {
      id: raw.id,
      channel_id: raw.channel_id,
      question: raw.question,
      options: rawOptions.map((o) => ({ id: o.id, text: o.text, vote_count: 0, voted: false })),
      total_votes: 0,
      created_by: raw.creator_pubkey,
      created_at: raw.created_at,
      ends_at: raw.ends_at,
      is_deleted: false,
    };
  }

  function getEvents(): Promise<HubEvent[]> {
    if (!activeHub) return Promise.resolve([]);
    return invoke<HubEvent[]>("get_hub_events", { hubUrl: activeHub.hub_url });
  }
  function deleteEvent(eventId: string): Promise<void> {
    return invoke<void>("delete_event", { hubUrl: activeHub?.hub_url ?? "", eventId });
  }
  function rsvpEvent(eventId: string, status: RsvpStatus, slotId?: string): Promise<void> {
    return invoke<void>("rsvp_event_hub", { hubUrl: activeHub?.hub_url ?? "", eventId, status, slotId: slotId ?? null });
  }
  function createEvent(payload: CreateEventPayload): Promise<HubEvent> {
    return invoke<HubEvent>("create_event_hub", {
      hubUrl: activeHub?.hub_url ?? "",
      title: payload.title,
      description: payload.description ?? "",
      startsAt: payload.starts_at,
      endsAt: payload.ends_at ?? null,
      channelId: payload.channel_id,
      location: payload.location ?? null,
      reminderMinutes: payload.reminder_minutes ?? null,
      slots: payload.slots ?? [],
      hubWide: payload.hub_wide ?? false,
      propagateToChildren: payload.propagate_to_children ?? false,
    });
  }

  const eventStaging: EventStagingCapability | undefined = activeHub ? {
    channels, users, voicePartByChannel, canMoveMembers, onMoveMember,
    getEvent: (eventId) => invoke<HubEvent>("get_event", { hubUrl: activeHub.hub_url, eventId }),
    getEventAssignments: (eventId) =>
      invoke<EventMoveAssignment[]>("get_event_assignments", { hubUrl: activeHub.hub_url, eventId }),
    getEventRsvps: (eventId) =>
      invoke<EventRsvp[]>("get_event_rsvps", { hubUrl: activeHub.hub_url, eventId }),
    createEventSquadRooms: (eventId, count, namePrefix) =>
      invoke<Channel[]>("create_event_squad_rooms", { hubUrl: activeHub.hub_url, eventId, count, namePrefix: namePrefix ?? null }),
  } : undefined;

  return (
    <>
      <SharedContentArea
        {...props}
        // Desktop's sidebar doesn't track collapsed-category state the way
        // web's does (ChannelSidebar collapse persistence), so the
        // breadcrumb renders but a crumb click is a no-op here for now.
        onBreadcrumbCategoryClick={() => {}}
        forumActions={forumActions}
        messageRowActions={messageRowActions}
        profileCardActions={profileCardActions}
        loadBotProfile={loadBotProfile}
        loadHubEmojis={loadHubEmojis}
        loadChannelPolls={loadChannelPolls}
        loadThreadReplies={loadThreadReplies}
        loadExpandedThreads={loadExpandedThreads}
        saveExpandedThreads={saveExpandedThreads}
        onComponentInteract={handleComponentInteract}
        onCreatePoll={onCreatePoll}
        loadWelcomeInfo={loadWelcomeInfo}
        isWelcomeDismissed={isWelcomeDismissed}
        dismissWelcome={dismissWelcome}
        eventsPresentation="modal"
        getEvents={getEvents}
        deleteEvent={deleteEvent}
        rsvpEvent={rsvpEvent}
        createEvent={createEvent}
        eventStaging={eventStaging}
        onShowPinned={() => setShowPinned(true)}
      />
      {showPinned && activeHub && selectedChannel && (
        <PinnedMessages
          hubUrl={activeHub.hub_url}
          channelId={selectedChannel.id}
          channelName={selectedChannel.name}
          isAdmin={isAdmin}
          onClose={() => setShowPinned(false)}
          onScrollToMessage={onScrollToMessage}
        />
      )}
    </>
  );
}
