// Shared type definitions for the Wavvon desktop client.
//
// These map to the JSON shapes returned by Tauri commands and hub
// HTTP endpoints. Keep them in sync with the Rust side; a renamed
// field in src-tauri or server/wavvon-hub means a rename here too.

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
}

export interface HubIcon {
  id: string;
  name: string;
  svg_content: string;
  uploaded_by: string;
  created_at: number;
}

export interface Attachment {
  name: string;
  mime: string;
  data_b64: string;
}

export interface RemoteAttachment {
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

export interface UserProfile {
  pubkey: string;
  display_name: string | null;
  avatar: string | null;
  joined_at: number;
  roles: RoleInfo[];
  badges: string[];
}

export interface PollOption {
  id: string;
  text: string;
  vote_count: number;
  voted: boolean;
}

export interface Poll {
  id: string;
  channel_id: string;
  question: string;
  options: PollOption[];
  total_votes: number;
  created_by: string;
  created_at: number;
  ends_at: number | null;
  is_deleted: boolean;
}

export type RsvpStatus = "going" | "maybe" | "not_going";

export interface EventRsvp {
  pubkey: string;
  status: RsvpStatus;
}

export interface EventSlot {
  id: string;
  name: string;
  capacity: number | null;
  position: number;
  claimed: number;
  claimants: string[];
}

export interface HubEvent {
  id: string;
  channel_id?: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: number;
  // Matches the hub's `ends_at` field name (see hub/src/routes/events.rs).
  ends_at: number | null;
  creator_pubkey?: string;
  created_at: number;
  rsvp_counts: { going: number; maybe: number; not_going: number };
  slots: EventSlot[];
  reminder_minutes: number | null;
  reminder_sent_at: number | null;
}

export type NotifLevel = "all" | "mentions" | "none";

export interface Reaction {
  emoji: string;
  count: number;
  me: boolean;
}

export interface ReplyContext {
  message_id: string;
  sender: string;
  sender_name: string | null;
  content_preview: string;
}

export interface Message {
  id: string;
  channel_id: string;
  sender: string;
  sender_name: string | null;
  content: string;
  created_at: number;
  edited_at: number | null;
  attachments?: Attachment[];
  reactions?: Reaction[];
  reply_to?: ReplyContext | null;
  visible_to_pubkey?: string | null;
  embeds?: Embed[];
  components?: ComponentRow[];
  is_bot_sender?: boolean;
  reply_count?: number;
}

export type NotifyMode = "all" | "mentions" | "silent";

export interface User {
  public_key: string;
  display_name: string | null;
  avatar: string | null;
  online: boolean;
  group_role: string | null;
  is_bot?: boolean;
  is_webhook?: boolean;
}

export interface BotInfo {
  public_key: string;
  display_name: string;
  created_by: string;
  created_at: number;
  token?: string;
}

export interface VoiceParticipant {
  public_key: string;
  display_name: string | null;
}

export interface Hub {
  hub_id: string;
  hub_name: string;
  hub_url: string;
  hub_icon: string | null;
  is_active: boolean;
}

export interface RoleInfo {
  id: string;
  name: string;
  permissions: string[];
  priority: number;
  display_separately?: boolean;
  color: string | null;
  icon: string | null;
  category_id: string | null;
}

export interface RoleCategory {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  position: number;
  created_at: number;
}

export interface ChannelRoleOverwrites {
  allow: string[];
  deny: string[];
}

export interface ChannelRolePermissions {
  role_id: string;
  role_name: string;
  overwrites: ChannelRoleOverwrites;
  inherited: string[];
  effective: string[];
}

export interface ChannelPermissionsResponse {
  channel_id: string;
  roles: ChannelRolePermissions[];
}

export interface NamedProfile {
  id: string;
  label: string;
  display_name: string;
  avatar: string | null;
}

export interface MeInfo {
  public_key: string;
  display_name: string | null;
  avatar: string | null;
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
}

export interface PendingUser {
  public_key: string;
  display_name: string | null;
  first_seen_at: number;
}

export interface Friend {
  public_key: string;
  display_name: string | null;
  /** When non-null, this friend lives on another hub. DMs to them will be
   *  routed to this hub via the federated DM outbox. */
  hub_url: string | null;
  since: number;
}

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
}

export interface PublicHubEntry {
  hub_url: string;
  hub_name: string;
  joined_at: number;
}

export interface PublicHubProfile {
  pubkey: string;
  display_name: string;
  avatar: string | null;
  public_hubs: PublicHubEntry[];
  issued_at: number;
  signature: string;
}

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

export interface ActiveStream {
  stream_id: string;
  sharer_pubkey: string;
  kind: "screen" | "webcam";
  mime: string;
  has_audio: boolean;
}

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

export interface Embed {
  title?: string;
  url?: string;
  description?: string;
  color?: string;
  fields?: EmbedField[];
  thumbnail_url?: string;
  image_url?: string;
  footer?: { text: string };
}

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface ComponentRow {
  type: "row";
  components: BotComponent[];
}

export type BotComponent = BotButton | BotSelect;

export interface BotButton {
  type: "button";
  custom_id: string;
  label: string;
  style?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}

export interface BotSelect {
  type: "select";
  custom_id: string;
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  options: SelectOption[];
}

export interface SelectOption {
  label: string;
  value: string;
  description?: string;
}

export interface BotCommandDef {
  name: string;
  description: string;
}

export interface BotProfile {
  pubkey: string;
  name: string;
  avatar_url: string | null;
  description: string | null;
  commands: BotCommandDef[];
}

export interface ExternalBotRow {
  public_key: string;
  display_name: string | null;
  local_note: string | null;
  approval_status: "pending" | "active" | "removed";
  last_seen_at: number | null;
}

export interface ExternalBotInviteResult {
  bot_invite_token: string;
  pubkey: string;
}

// ---- Farm ----

export type FarmCreationPolicy = "open" | "admin_only" | "disabled";

export interface FarmSettings {
  name: string;
  description: string;
  creation_policy: FarmCreationPolicy;
  max_hubs_per_user: number;
  max_hubs_total: number;
  allow_discovery_listing: boolean;
  directory_public: boolean;
  languages: string[];
  tags: string[];
  country: string;
  region: string;
}

export interface FarmHubEntry {
  id: string;
  name: string;
  description: string | null;
  owner_pubkey: string;
  owner_display: string | null;
  visibility: "public" | "private";
  member_count: number | null;
  url: string;
  hub_pubkey: string;
  created_at: number;
  suspended_at: number | null;
}

export interface FarmUserEntry {
  public_key: string;
  master_pubkey: string | null;
  first_seen_at: number;
  last_seen_at: number;
  hubs_owned: number;
  hubs_member_of: number;
  active_sessions: number;
}

export interface FarmUsersResponse {
  users: FarmUserEntry[];
  total: number;
  page: number;
  limit: number;
  next_cursor: string | null;
}

export interface FarmPublicInfo {
  kind: "wavvon-farm-public";
  name: string;
  description: string;
  creation_policy: FarmCreationPolicy;
  hub_count: number;
  max_hubs_total: number;
  allow_discovery_listing: boolean;
  country: string;
  region: string;
  languages: string[];
  tags: string[];
  icon: string | null;
}

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

export interface FarmHubQuota {
  hubs_owned_by_user: number;
  max_hubs_per_user: number;
  total_hubs: number;
  max_hubs_total: number;
  can_create: boolean;
  reason: "quota_exceeded" | "policy_admin_only" | "policy_disabled" | null;
}

export interface CreatedFarmHub {
  id: string;
  url: string;
  hub_pubkey: string;
  name: string;
  visibility: "public" | "private";
  created_at: number;
}

// ---- Webhooks ----

export interface WebhookInfo {
  id: string;
  display_name: string;
  channel_id: string;
  channel_name: string | null;
  webhook_url: string;
  created_by: string;
  created_at: number;
}

export interface WebhookCreatedResult {
  id: string;
  webhook_url: string;
}

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

export interface ReactionCount {
  emoji: string;
  count: number;
  me: boolean;
}

export interface ForumAttachment {
  url: string;
  name: string;
  mime: string;
  size: number;
}

export interface PostSummary {
  id: string;
  channel_id: string;
  author_pubkey: string;
  title: string | null;
  created_at: number;
  edited_at: number | null;
  is_pinned: boolean;
  is_locked: boolean;
  reply_count: number;
  last_activity_at: number;
  is_deleted: boolean;
  unread_reply_count?: number | null;
  reactions?: ReactionCount[];
  attachments?: ForumAttachment[];
}

export interface ReplyView {
  id: string;
  post_id: string;
  author_pubkey: string;
  body: string | null;
  created_at: number;
  edited_at: number | null;
  reply_to_id: string | null;
  is_deleted: boolean;
  reactions?: ReactionCount[];
  attachments?: ForumAttachment[];
}

export interface PostDetail extends PostSummary {
  body: string | null;
  replies: ReplyView[];
  reply_cursor?: string;
}

export interface PostListResponse {
  posts: PostSummary[];
  cursor?: string;
}

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
}

export interface HubCertification {
  payload: CertPayload;
  signature: string;
}

export interface CertIssuance {
  subject_pubkey: string;
  issued_at: number;
  expires_at: number;
  standing: "good" | "revoked";
  pow_level: number | null;
  signature: string;
}

export interface CertAdmissionSettings {
  cert_auto_issue: boolean;
  cert_min_age_days: number;
  cert_validity_days: number;
  cert_min_pow_level: number | null;
  cert_mode: "off" | "any" | "all";
  cert_trusted_issuers: { pubkey: string; url: string; label: string }[];
  cert_require: { min_pow_level?: number; min_member_since_days?: number } | null;
}

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

export interface DndSchedule {
  start: string;
  end: string;
  tz: string;
}

export interface DndSettings {
  enabled: boolean;
  schedule: DndSchedule | null;
}

// ---- Link Preview ----

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  domain: string;
}

// ---- Bot mini-app events ----

export interface BotAppLaunchEvent {
  type: 'bot_app_launch';
  bot_id: string;
  title: string;
  description: string;
  channel_id: string;
}

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
