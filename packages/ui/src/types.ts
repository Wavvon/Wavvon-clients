import type { GameLaunchCard } from "@wavvon/core";

export interface Attachment {
  name: string;
  mime: string;
  data_b64: string;
}

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
  /** Bot-authored "Play" launch card (bot-capability-layer.md §2). Bot messages only. */
  game?: GameLaunchCard | null;
}

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

export interface User {
  public_key: string;
  display_name: string | null;
  avatar: string | null;
  online: boolean;
  /** Presence while online: absent/null = plain online, "away", "dnd". */
  status?: string | null;
  /** Optional short custom status text (only present while online). */
  status_custom?: string | null;
  group_role: string | null;
  is_bot?: boolean;
  is_webhook?: boolean;
}

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  domain: string;
}

export interface AllianceSharedChannel {
  channel_id: string;
  channel_name: string;
  hub_public_key: string;
  hub_name: string;
  // Optional: desktop's own AllianceSharedChannel (apps/desktop/src/types.ts)
  // hasn't picked up the v2 alliance-sharing fields yet. Keep these optional
  // here so AllianceView stays a valid sink for both the old and new shape.
  channel_type?: "text" | "forum" | "banner" | "spawner";
  parent_id?: string | null;
  is_category?: boolean;
}

export interface AllianceInfo {
  id: string;
  name: string;
  created_by: string;
  created_at: number;
}

export interface Conversation {
  id: string;
  conv_type: string;
  members: string[];
  created_at: number;
  last_activity_at?: number;
}

export interface BlockEntry {
  pubkey: string;
  since: number;
}

export interface IgnoreEntry {
  pubkey: string;
  since: number;
}

export interface BotAppLaunchEvent {
  type: "bot_app_launch";
  bot_id: string;
  title: string;
  description: string;
  channel_id: string;
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
  /** Profile-declared game descriptor (bot-capability-layer.md §11): drives
   *  the directory card's Play affordance. Absent = bot never declared one. */
  game?: GameLaunchCard | null;
}

export interface HubEmoji {
  id: string;
  name: string;
  url: string;
}

/** A claimant's current voice standing relative to an event (events.md §7.5).
 *  Computed by the caller — this component never inspects voice/assignment
 *  state itself, only renders what it's told. */
export type ClaimantVoiceStatus =
  | { kind: "in_voice"; channelName: string }
  | { kind: "assigned"; channelName: string; voiceOnly: boolean }
  | { kind: "none" };

/** One staging-panel bucket: an event slot's claimants, or the synthesized
 *  "Unassigned" bucket (`id: null`) for plain "going" RSVPs with no slot. */
export interface StagingGroup {
  id: string | null;
  name: string;
  capacity: number | null;
  claimed: number | null;
  claimants: string[];
}

export interface Hub {
  hub_id: string;
  hub_name: string;
  hub_url: string;
  hub_icon: string | null;
  is_active: boolean;
}

export type NotifyMode = "all" | "mentions" | "silent";

export type FarmCreationPolicy = "open" | "admin_only" | "disabled";

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

export interface FarmServerEntry {
  id: string;
  name: string;
  region: string | null;
  connected: boolean;
  last_seen_at: number | null;
}

export interface VoiceParticipant {
  public_key: string;
  display_name: string | null;
}

export interface WhisperTarget {
  type: "user" | "channel" | "role";
  id: string;
  label: string;
}

export interface WhisperList {
  id: string;
  name: string;
  targets: WhisperTarget[];
  keybind?: string;
}

/** Ephemeral "X played Y" attribution chip shown near the soundboard trigger. */
export interface SoundboardChip {
  id: string;
  public_key: string;
  clip_name: string;
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

// Matches the hub's RsvpEntry field name exactly (hub/src/routes/events.rs)
// — GET /events/:id/rsvps returns `user_pubkey`, not `pubkey`.
export interface EventRsvp {
  user_pubkey: string;
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
  // events.md §5/§6: hub-level visibility and sub-channel card fan-out.
  // Both default false server-side and are always present on responses.
  hub_wide: boolean;
  propagate_to_children: boolean;
}

// A queued voice-move (events.md §7.3) — persisted when a staging-panel
// move targets a member who isn't in voice yet, applied on their next join.
export interface EventMoveAssignment {
  user_pubkey: string;
  target_channel_id: string;
  assigned_by: string;
  created_at: number;
  voice_only: boolean;
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
  /** Origin hub public key hex when authored through the alliance forum
   * write-proxy (forum federation phase 2); absent for locally-authored posts. */
  author_hub?: string | null;
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
  author_hub?: string | null;
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

// ---- Hub admin: alliances, external bots, webhooks, hub icons, survey ----

export interface Alliance {
  id: string;
  name: string;
  created_by: string;
  created_at: number;
}

export interface AllianceMember {
  hub_public_key: string;
  hub_name: string;
  hub_url: string;
  joined_at: number;
}

export interface AllianceDetail extends Alliance {
  members: AllianceMember[];
}

export interface PendingAllianceInvite {
  id: string;
  alliance_id: string;
  alliance_name: string;
  from_hub_url: string;
  from_hub_name: string;
  from_hub_public_key: string;
  invite_token: string;
  created_at: number;
  message: string | null;
}

export interface SharedChannel {
  channel_id: string;
  channel_name: string;
  hub_public_key: string;
  hub_name: string;
  channel_type: "text" | "forum" | "banner" | "spawner";
  parent_id: string | null;
  is_category: boolean;
  forum_remote_write?: "none" | "replies_only" | "posts_and_replies";
}

export interface ExternalBotRow {
  public_key: string;
  local_note: string | null;
  display_name: string | null;
  approval_status: "pending" | "active" | "removed";
  last_seen_at: number | null;
}

export interface ExternalBotInviteResult {
  bot_invite_token: string;
  pubkey: string;
}

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

export interface HubIcon {
  id: string;
  name: string;
  svg_content: string;
  uploaded_by: string;
  created_at: number;
}

export interface SurveyChoice {
  id: string;
  label: string;
  display_order: number;
  role_ids: string[];
}

export interface SurveyQuestion {
  id: string;
  prompt: string;
  kind: "text" | "choice";
  required: boolean;
  display_order: number;
  choices?: SurveyChoice[];
}

export interface SurveyAdmin {
  id: string;
  enabled: boolean;
  questions: SurveyQuestion[];
}

export interface SurveyResponseView {
  response_id: string;
  pubkey: string;
  display_name?: string;
  submitted_at: number;
  answers: { question_id: string; prompt: string; choice_label?: string; text_answer?: string }[];
}

export interface GlobalSearchResult {
  message_id: string;
  channel_id: string;
  channel_name: string;
  sender: string;
  sender_name: string | null;
  content_preview: string;
  created_at: number;
}

export interface LobbyStatusInfo {
  status: string;
  required_level: number;
  current_level: number;
  entered_at?: number | null;
  welcome_md?: string | null;
}

export interface LobbyWelcomeInfo {
  welcome_md: string;
  hub_name?: string;
  required_level?: number;
}

export interface SubmitPowResultInfo {
  promoted: boolean;
  new_level: number;
}

export interface HubListing {
  hub_pubkey: string;
  hub_url: string;
  name: string;
  description: string | null;
  icon: string | null;
  invite_only: boolean;
  min_security_level: number;
  invite_code: string | null;
  bio: string;
  tags: string[];
  language: string;
  nsfw?: boolean;
  badges?: { payload: { label: string; issuer_url: string; issuer_pubkey: string }; signature: string }[];
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

export interface Friend {
  public_key: string;
  display_name: string | null;
  /** When non-null, this friend lives on another hub. DMs to them will be
   *  routed to this hub via the federated DM outbox. */
  hub_url: string | null;
  since: number;
}

export interface FavoriteHub {
  url: string;
  name: string;
  icon: string | null;
}

export interface BadgeSummary {
  id: string;
  label: string;
  color?: string;
}

export interface UserProfile {
  pubkey: string;
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
  joined_at: number;
  roles: RoleInfo[];
  badges: BadgeSummary[];
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

export interface HubStreamInfo {
  channel_id: string;
  stream_id: string;
  sharer_pubkey: string;
  kind: "screen" | "webcam";
  mime: string;
  has_audio: boolean;
}

export interface ActiveStream {
  stream_id: string;
  sharer_pubkey: string;
  kind: "screen" | "webcam";
  mime: string;
  has_audio: boolean;
}

// ---------------------------------------------------------------------------
// Channel permission overwrites (Nested Channels §3.6) — ChannelSettingsModal
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// HubAdminPage (parity hoist, 2026-07-20)
// ---------------------------------------------------------------------------

export interface PendingUser {
  public_key: string;
  display_name: string | null;
  first_seen_at: number;
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

export interface HubSelfTagSettings {
  self_tags: string[];
  nsfw: boolean;
}

export interface HubBadge {
  id: string;
  label: string;
  issuer_url: string;
}

export interface PendingBadgeOffer {
  id: string;
  label: string;
  issuer_url: string;
}

export interface NativeBot {
  public_key: string;
  display_name: string;
  created_by: string;
  created_at: number;
  webhook_url?: string | null;
}

export interface NativeBotCreated extends NativeBot {
  token: string;
}

export interface BotSlashCommandInfo {
  command: string;
  description: string;
}

export interface NativeBotDetail {
  public_key: string;
  display_name: string;
  created_by: string;
  created_at: number;
  webhook_url: string | null;
  commands: BotSlashCommandInfo[];
}

export interface SoundboardClip {
  id: string;
  name: string;
  emoji: string | null;
  uploader: string;
  duration_ms: number;
  size_bytes: number;
  created_at: number;
}

export interface AuditLogEntry {
  seq: number;
  event_type: string;
  at: number;
  actor_pubkey: string | null;
  target_pubkey: string | null;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  next_cursor: number | null;
}

export interface CertIssuance {
  subject_pubkey: string;
  issued_at: number;
  expires_at: number;
  standing: "good" | "revoked";
}

export interface CertAdmissionSettings {
  cert_mode: "none" | "any" | "trusted";
  cert_auto_issue: boolean;
  cert_min_age_days: number;
  cert_validity_days: number;
  cert_trusted_issuers: string[];
}

export type ChallengeMode = "off" | "click" | "puzzle" | "both";
export type ChallengeDifficulty = "easy" | "medium";
