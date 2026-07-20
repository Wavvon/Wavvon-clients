// Shared type definitions for the Wavvon desktop client.
//
// These map to the JSON shapes returned by Tauri commands and hub
// HTTP endpoints. Keep them in sync with the Rust side; a renamed
// field in src-tauri or server/wavvon-hub means a rename here too.

import type { FarmSettings, FarmHubEntry, FarmUserEntry } from "@wavvon/ui";
export type { FarmSettings, FarmHubEntry, FarmUserEntry };

export interface Channel {
  id: string;
  name: string;
  created_by: string;
  parent_id: string | null;
  is_category: boolean;
  channel_type?: "text" | "forum" | "banner" | "spawner";
  banner_url?: string | null;
  banner_file_id?: string | null;
  display_order: number;
  description: string | null;
  icon: string | null;
  color: string | null;
  custom_icon_svg: string | null;
  created_at: number;
  /** True for a join-to-create personal room spawned from a spawner channel. */
  is_temporary?: boolean;
  /** Set only on temp channels: the joiner who owns (and may rename) it. Absent/null otherwise. */
  owner_pubkey?: string | null;
  /** Set only on spawner channels: the name template used for rooms it spawns. Absent/null otherwise. */
  spawner_name_template?: string | null;
  /** Set only on auto-spawned squad rooms (events.md §7.5): the event this room was created for. */
  event_id?: string | null;
}

export interface Attachment {
  name: string;
  mime: string;
  data_b64: string;
}

export interface RemoteAttachment {
  /** upload_files row id — referenced by e.g. a banner channel's banner_file_id. */
  id: string;
  url: string;
  filename: string;
  size_bytes: number;
  mime_type: string;
}

export interface PinnedMessage {
  id: string;
  channel_id: string;
  sender: string;
  sender_name: string | null;
  content: string;
  created_at: number;
  pinned_at: number;
  pinned_by: string;
}

import type { BadgeSummary, FavoriteHub, UserProfile, RoleInfo, RoleCategory } from "@wavvon/ui";
export type { BadgeSummary, FavoriteHub, UserProfile, RoleInfo, RoleCategory };

// Own presence state. "invisible" = connected but shown offline to others.
export type PresenceStatus = "online" | "away" | "dnd" | "invisible";

export type {
  PollOption,
  Poll,
  RsvpStatus,
  EventRsvp,
  EventSlot,
  HubEvent,
  EventMoveAssignment,
  VoiceParticipant,
} from "@wavvon/ui";

export type NotifLevel = "all" | "mentions" | "none";

export interface Reaction {
  emoji: string;
  count: number;
  me: boolean;
}

export type { ReplyContext, Message, User } from "@wavvon/ui";

export type { NotifyMode } from "@wavvon/ui";

export interface BotInfo {
  public_key: string;
  display_name: string;
  created_by: string;
  created_at: number;
  token?: string;
}

export type { Hub } from "@wavvon/ui";

export type { ChannelRoleOverwrites, ChannelRolePermissions, ChannelPermissionsResponse } from "@wavvon/ui";

export interface MeInfo {
  public_key: string;
  display_name: string | null;
  avatar: string | null;
  bio: string | null;
  pronouns: string | null;
  status_message: string | null;
  activities: string | null;
  accent_color: string | null;
  cover: string | null;
  favorite_hubs: FavoriteHub[];
  show_hubs: boolean;
  approval_status: "approved" | "pending";
  roles: RoleInfo[];
}

export interface MemberAdminInfo {
  public_key: string;
  display_name: string | null;
  online: boolean;
  first_seen_at: number;
  last_seen_at: number;
  roles: RoleInfo[];
}

export interface BanInfo {
  target_public_key: string;
  banned_by: string;
  reason: string | null;
  created_at: number;
}

export interface VoiceMuteInfo {
  target_public_key: string;
  muted_by: string;
  reason: string | null;
  created_at: number;
}

export interface SoundboardClip {
  id: string;
  name: string;
  emoji: string | null;
  uploader: string;
  size_bytes: number;
  duration_ms: number;
  created_at: number;
}

export interface SoundboardPlayedEvent {
  channel_id: string;
  clip_id: string;
  clip_name: string;
  public_key: string;
}

export interface InviteInfo {
  code: string;
  created_by: string;
  max_uses: number | null;
  uses: number;
  expires_at: number | null;
  created_at: number;
  /** Role granted to the joining user in addition to `builtin-everyone`, if any. */
  grant_role_id: string | null;
}

export interface PendingUser {
  public_key: string;
  display_name: string | null;
  first_seen_at: number;
}

export type { Friend } from "@wavvon/ui";

export interface Conversation {
  id: string;
  conv_type: string;
  members: string[];
  created_at: number;
  last_activity_at?: number;
}

export interface DmMessage {
  id?: string;
  sender: string;
  sender_name: string | null;
  content: string;
  timestamp: number;
  attachments?: Attachment[];
  is_encrypted?: boolean;
  /** True when at least one outbox row for this message has bounced
   *  (retries exhausted). Renders a delivery-failed mark next to the
   *  message. False/missing for received messages and not-yet-bounced sends. */
  delivery_failed?: boolean;
}

export interface DmMessageFull {
  id: string;
  conversation_id: string;
  sender: string;
  sender_name: string | null;
  content: string;
  created_at: number;
  attachments?: Attachment[];
  is_encrypted?: boolean;
  delivery_failed?: boolean;
}

// Personal-axis identity envelopes (hub/src/routes/identity.rs). Plaintext,
// signed — no E2E decryption needed, unlike DMs and the prefs blob.
export interface HomeHubList {
  master_pubkey: string;
  hubs: string[];
  issued_at: number;
  sequence: number;
  signature: string;
}

export interface SubkeyCert {
  master_pubkey: string;
  subkey_pubkey: string;
  device_label: string;
  issued_at: number;
  not_after: number | null;
  fallback_hubs: string[];
  signature: string;
}

export interface RevocationEntry {
  master_pubkey: string;
  subkey_pubkey: string;
  revoked_at: number;
  signature: string;
}

// The hub only ever stores this ciphertext — decrypting it requires the
// entropy-holding device's master seed (see utils/dataExport.ts).
export interface SignedPrefsBlob {
  master_pubkey: string;
  blob_version: number;
  ciphertext_hex: string;
  signature: string;
}

export interface AllianceInfo {
  id: string;
  name: string;
  created_by: string;
  created_at: number;
}

export interface AllianceMemberInfo {
  hub_public_key: string;
  hub_name: string;
  hub_url: string;
  joined_at: number;
}

export interface AllianceDetail {
  id: string;
  name: string;
  created_by: string;
  created_at: number;
  members: AllianceMemberInfo[];
}

export interface AllianceInvite {
  token: string;
  alliance_id: string;
  alliance_name: string;
  hub_url: string;
}

export interface AllianceSharedChannel {
  channel_id: string;
  channel_name: string;
  hub_public_key: string;
  hub_name: string;
  channel_type: "text" | "forum" | "banner" | "spawner";
  parent_id: string | null;
  is_category: boolean;
  /** Policy governing writes proxied from other alliance-member hubs into
   * this channel (forum federation phase 2). Absent from peers that haven't
   * upgraded yet; treat as "replies_only", the hub-side column default. */
  forum_remote_write?: "none" | "replies_only" | "posts_and_replies";
}

export type { PublicHubEntry, PublicHubProfile } from "@wavvon/ui";

export interface WsScreenShareStarted {
  type: "screen_share_started";
  channel_id: string;
  stream_id: string;
  sharer_pubkey: string;
  kind: "screen" | "webcam";
  mime: string;
  has_audio: boolean;
}

export interface WsScreenShareChunkOut {
  type: "screen_share_chunk";
  channel_id: string;
  stream_id: string;
  sharer_pubkey: string;
  seq: number;
  is_init: boolean;
}

export interface WsScreenShareStopped {
  type: "screen_share_stopped";
  channel_id: string;
  stream_id: string;
  sharer_pubkey: string;
}

export type { ActiveStream } from "@wavvon/ui";

export type { HubStreamInfo } from "@wavvon/ui";

export interface ScreenShareOpts {
  includeAudio: boolean;
  includeWebcam: boolean;
  webcamDeviceId: string;
}

export interface SyncResult {
  synced: boolean;
  error: string | null;
}

export interface PendingAllianceInvite {
  id: string;
  alliance_id: string;
  alliance_name: string;
  from_hub_url: string;
  from_hub_name: string;
  from_hub_public_key: string;
  invite_token: string;
  message: string | null;
  created_at: number;
}

// ---- Security Level Lobby ----

export interface LobbyStatus {
  status: "lobby" | "promoted" | "member";
  required_level: number;
  current_level: number;
  entered_at: number | null;
  welcome_md: string | null;
}

// ---- Bot Challenge ----

export interface ChallengePrompt {
  id: string;
  mode: "click" | "puzzle" | "both";
  prompt_svg: string | null;
  expires_at: number;
}

export interface ChallengeResult {
  ok: boolean;
  token: string | null;
  expires_at: number | null;
  next_challenge: ChallengePrompt | null;
  attempts_remaining: number | null;
}

// ---- Role Questionnaire / Onboarding Survey ----

export interface SurveyChoice {
  id: string;
  label: string;
  display_order: number;
}

export interface SurveyQuestion {
  id: string;
  prompt: string;
  kind: "choice" | "text";
  required: boolean;
  display_order: number;
  choices?: SurveyChoice[];
}

export interface Survey {
  id: string;
  questions: SurveyQuestion[];
}

export interface SurveyAnswer {
  question_id: string;
  choice_id?: string;
  text_answer?: string;
}

export interface SurveySubmitResult {
  next_state: "approved" | "pending";
  applied_roles: string[];
}

export interface SurveyChoiceAdmin extends SurveyChoice {
  role_ids: string[];
}

export interface SurveyQuestionAdmin extends SurveyQuestion {
  choices?: SurveyChoiceAdmin[];
}

export interface SurveyAdmin {
  id: string;
  enabled: boolean;
  questions: SurveyQuestionAdmin[];
}

export interface SurveyResponseAdmin {
  response_id: string;
  pubkey: string;
  display_name: string | null;
  submitted_at: number;
  answers: Array<{
    question_id: string;
    prompt: string;
    choice_label: string | null;
    text_answer: string | null;
  }>;
}

// ---- Bots ----

export interface BotAdminInfo {
  public_key: string;
  display_name: string;
  created_by: string;
  created_at: number;
  webhook_url: string | null;
}

export interface BotCreatedResult {
  public_key: string;
  display_name: string;
  created_by: string;
  created_at: number;
  token: string;
}

export interface BotSlashCommandInfo {
  command: string;
  description: string;
}

export interface BotDetailInfo extends BotAdminInfo {
  commands: BotSlashCommandInfo[];
}


// ---- Bot message types ----

export type {
  Embed, EmbedField, ComponentRow, BotComponent, BotButton, BotSelect, SelectOption,
  BotCommandDef, BotProfile,
} from "@wavvon/ui";
export type { ExternalBotRow, ExternalBotInviteResult } from "@wavvon/ui";

// ---- Farm ----

export type FarmCreationPolicy = "open" | "admin_only" | "disabled";

export interface FarmUsersResponse {
  users: FarmUserEntry[];
  total: number;
  page: number;
  limit: number;
  next_cursor: string | null;
}

export type { FarmPublicInfo } from "@wavvon/ui";

export interface FarmInfo {
  kind: "wavvon-farm";
  name: string;
  description: string;
  public_key: string;
  admin_pubkey: string;
  directory_public: boolean;
  policy: {
    creation_policy: FarmCreationPolicy;
    max_hubs_per_creator: number;
    hub_creation_open: boolean;
    allow_discovery_listing: boolean;
  };
}

export type { FarmHubQuota, CreatedFarmHub } from "@wavvon/ui";

// ---- Webhooks ----

export type { WebhookInfo, WebhookCreatedResult } from "@wavvon/ui";

// ---- Event subscriptions (shared shape: bots and outgoing webhooks) ----

export interface EventSubscription {
  event: string;
  channels?: string[];
}

// ---- Outgoing webhooks ----

export interface OutgoingWebhookSummary {
  id: string;
  url: string;
  display_name: string | null;
  active: boolean;
  failure_count: number;
  last_delivery_at: number | null;
  last_failure_at: number | null;
  created_at: number;
  created_by_pubkey: string;
  subscription_count: number;
}

export interface OutgoingWebhookCreatedResult {
  id: string;
  url: string;
  display_name: string | null;
  secret: string;
}

export interface OutgoingWebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  event_seq: number | null;
  attempted_at: number;
  attempt_number: number;
  status_code: number | null;
  success: boolean;
  error_msg: string | null;
}

// ---- Forum ----

export type {
  ReactionCount,
  ForumAttachment,
  PostSummary,
  ReplyView,
  PostDetail,
  PostListResponse,
} from "@wavvon/ui";

// ---- Server Tags / Badges ----

export interface HubSelfTagSettings {
  self_tags: string[];
  nsfw: boolean;
}

export interface HubBadge {
  id: string;
  issuer_pubkey: string;
  issuer_url: string;
  label: string;
  issued_at: number;
  expires_at: number | null;
  signature: string;
  accepted_at: number;
}

export interface PendingBadgeOffer {
  id: string;
  issuer_pubkey: string;
  issuer_url: string;
  label: string;
  issued_at: number;
  expires_at: number | null;
  signature: string;
  received_at: number;
}

// ---- Hub Certifications ----

export interface CertPayload {
  subject_kind: "user";
  issuer_pubkey: string;
  issuer_url: string;
  subject_pubkey: string;
  member_since: number;
  standing: "good" | "revoked";
  pow_level: number | null;
  issued_at: number;
  expires_at: number;
  capabilities: string[];
  // Achievement badge: present → this cert is a named badge granted by the
  // issuer community. issuer_url links back to that hub.
  label?: string | null;
  description?: string | null;
  icon?: string | null;
}

export interface HubCertification {
  payload: CertPayload;
  signature: string;
}

export type { CertIssuance, CertAdmissionSettings } from "@wavvon/ui";

// ---- Identity Recovery ----

export interface RecoveryContact {
  pubkey: string;
  added_at: number;
}

export interface RecoverySettings {
  owner_pubkey: string;
  threshold: number;
  contacts: RecoveryContact[];
}

export interface RecoveryRotationRequest {
  id: string;
  old_pubkey: string;
  new_pubkey: string;
  status: string;
  reason: string | null;
  created_at: number;
  attestation_count: number;
}

// ---- Block / Ignore / DND ----

export interface BlockEntry {
  pubkey: string;
  since: number;
}

export interface IgnoreEntry {
  pubkey: string;
  since: number;
}

// ---- Link Preview ----

export type { LinkPreview } from "@wavvon/ui";

// ---- Bot mini-app events ----

export type { BotAppLaunchEvent } from "@wavvon/ui";

export interface BotAppOpenEvent {
  type: 'bot_app_open';
  bot_id: string;
  channel_id: string;
  mini_app_url: string;
  session_token: string;
  requires_camera: boolean;
}

export interface BotAppCloseEvent {
  type: 'bot_app_close';
  bot_id: string;
  channel_id: string;
}

// ---- WebRTC Screen Share v2 ----

export interface WsScreenShareOffer {
  type: "screen_share_offer_in";
  channel_id: string;
  stream_id: string;
  from_pubkey: string;
  sdp: string;
}

export interface WsScreenShareAnswer {
  type: "screen_share_answer_in";
  channel_id: string;
  stream_id: string;
  from_pubkey: string;
  sdp: string;
}

export interface WsScreenShareIce {
  type: "screen_share_ice_in";
  channel_id: string;
  stream_id: string;
  from_pubkey: string;
  candidate: string;
}

export interface WsScreenShareViewerJoined {
  type: "screen_share_viewer_joined";
  channel_id: string;
  stream_id: string;
  from_pubkey: string;
}

export interface WsScreenShareViewerLeft {
  type: "screen_share_viewer_left";
  channel_id: string;
  stream_id: string;
  from_pubkey: string;
}

// ---- Moderation (ME1 / ME2 / ME3) ----

export interface Report {
  id: string;
  message_id: string;
  message_content: string | null;
  channel_id: string;
  reporter_pubkey: string;
  reason: string;
  reported_at: number;
  status: string;
}

export interface ModerationSettings {
  webhook_url?: string;
  webhook_secret_set: boolean;
  circuit_open: boolean;
  circuit_open_until: number | null;
}

export interface BanlistSource {
  url: string;
  policy: "hard-reject" | "soft-flag";
  added_at: number;
  issuer_pubkey?: string;
}

export interface FederatedBanEntry {
  source_hub_pubkey: string;
  target_master_pubkey: string;
  reason?: string;
  added_at: number;
  synced_at: number;
}

export interface BanlistOverride {
  target_pubkey: string;
  override_type: "whitelist" | "blacklist";
  reason?: string;
  created_at: number;
}
