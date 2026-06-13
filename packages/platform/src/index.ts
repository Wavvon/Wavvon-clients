export interface WsHandlers {
  onMessage?: (m: object) => void;
  onDm?: (m: object) => void;
  onTyping?: (e: object) => void;
  onVoiceState?: (e: object) => void;
  onScreenShare?: (e: object) => void;
  onStatusChange?: (connected: boolean, hubId: string) => void;
  onPin?: (e: object) => void;
  onPoll?: (e: object) => void;
  onError?: (e: object) => void;
  onReauthNeeded?: (hubId: string) => void;
}

export interface SavedHub {
  hub_id: string;
  hub_name: string;
  hub_url: string;
  hub_icon: string | null;
  remember_token: boolean;
}

export interface UnreadCount {
  channel_id: string;
  unread_count: number;
}

export interface HubsApi {
  addHub(
    hub_url: string,
    handlers: WsHandlers,
    opts?: { invite_code?: string; rememberMe?: boolean },
  ): Promise<unknown>;
  listHubs(): unknown[];
  setActiveHub(hub_id: string): void;
  removeHub(hub_id: string): Promise<void>;
  pingHub(hub_id: string): Promise<number>;
  reauthorizeHub(hub_id: string, handlers: WsHandlers): Promise<void>;
  getHubInfo(hub_id: string): Promise<unknown | null>;
  previewHubInfo(hub_url: string): Promise<{ name: string; public_key: string; icon: string | null }>;
  reorderHubs(hub_ids: string[]): Promise<void>;
  restorePersistedHubs(handlers: WsHandlers): Promise<unknown[]>;
}

export interface MessagesApi {
  getMessages(channel_id: string, before?: string, limit?: number): Promise<unknown[]>;
  sendMessage(channel_id: string, content: string, attachments?: unknown[], reply_to?: string): Promise<void>;
  editMessage(channel_id: string, message_id: string, content: string): Promise<void>;
  deleteMessage(channel_id: string, message_id: string): Promise<void>;
  addReaction(channel_id: string, message_id: string, emoji: string): Promise<void>;
  removeReaction(channel_id: string, message_id: string, emoji: string): Promise<void>;
  searchMessages(channel_id: string, query: string, limit?: number): Promise<unknown[]>;
  subscribeChannel(channel_id: string): Promise<void>;
  unsubscribeChannel(channel_id: string): Promise<void>;
  getUnreadCounts(): Promise<UnreadCount[]>;
  markChannelRead(channel_id: string): Promise<void>;
  sendTypingEvent(channel_id: string, typing: boolean): void;
  sendDmTypingEvent(conversation_id: string, typing: boolean): void;
}

export interface DmsApi {
  listConversations(): Promise<unknown[]>;
  createConversation(member_pubkeys: string[]): Promise<unknown>;
  getDmMessages(conversation_id: string, before?: string, limit?: number): Promise<unknown[]>;
  sendDm(conversation_id: string, content: string, attachments?: unknown[]): Promise<void>;
  fetchDhKey(pubkey: string, hub_url?: string): Promise<string | null>;
  publishDhKey(): Promise<void>;
}

export interface PlatformInterface {
  hubs: HubsApi;
  messages: MessagesApi;
  dms: DmsApi;

  getActiveHubId(): string | null;
  setActiveHubId(id: string | null): void;
  get_hub_ws_info(): { hub_url: string; token: string };

  loadSavedHubs(): SavedHub[];
  saveSavedHubs(hubs: SavedHub[]): void;
  upsertSavedHub(hub: SavedHub): void;
  removeSavedHub(hub_id: string): void;
  loadActiveHubId(): string | null;
  saveActiveHubId(id: string | null): void;
  saveToken(hub_id: string, token: string, rememberMe: boolean): void;
  loadToken(hub_id: string): string | null;
  clearToken(hub_id: string): void;
}
