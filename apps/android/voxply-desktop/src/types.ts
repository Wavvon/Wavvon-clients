// Shared type definitions for the Voxply desktop client.
//
// These map to the JSON shapes returned by Tauri commands and hub
// HTTP endpoints. Keep them in sync with the Rust side; a renamed
// field in src-tauri or server/voxply-hub means a rename here too.

// Channel is shared with the channel-tree helpers in @voxply/utils.
export type { Channel } from "@voxply/utils";

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

// ---- Bot profile (public card) ----

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

// ---- External bots ----

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

// ---- Games ----

export interface InstalledGame {
  id: string;
  name: string;
  entry_url: string;
  description: string | null;
  thumbnail_url: string | null;
}

// ---- Forum ----

export interface PostSummary {
  id: string;
  channel_id: string;
  author_pubkey: string;
  title: string;
  created_at: number;
  edited_at: number | null;
  is_pinned: boolean;
  is_locked: boolean;
  reply_count: number;
  last_activity_at: number;
  is_deleted: boolean;
  unread_reply_count?: number | null;
}

export interface ReplyView {
  id: string;
  post_id: string;
  author_pubkey: string;
  body: string;
  created_at: number;
  edited_at: number | null;
  reply_to_id: string | null;
  is_deleted: boolean;
}

export interface PostDetail extends PostSummary {
  body: string;
  replies: ReplyView[];
  reply_cursor?: string;
}

// ---- Server tags / badges ----

export interface HubBadge {
  issuer_pubkey: string;
  issuer_url: string;
  label: string;
  issued_at: string;
  expires_at: string | null;
  signature: string;
}

export interface PendingBadgeOffer extends HubBadge {
  id: string;
  received_at: number;
}

// ---- Games (admin) ----

export interface AdminGame {
  id: string;
  name: string;
  entry_url: string;
  description: string | null;
  thumbnail_url: string | null;
  installed_by: string;
  installed_at: number;
  capabilities: string[];
  channel_scope: string[];
}

// ---- Gaming Tier 2 ----

export interface GameSession {
  session_id: string;
  game_id: string;
  channel_id: string;
  host_pubkey: string;
  status: "lobby" | "in_progress" | "ended" | "abandoned";
  players: GamePlayer[];
  max_players: number;
  created_at: number;
}

export interface GamePlayer {
  pubkey: string;
  display_name: string | null;
  joined_at: number;
  connected: boolean;
}

// ---- Hub certifications ----

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

export interface Certification {
  payload: CertPayload;
  signature: string;
}

// ---- Identity recovery ----

export interface RecoveryContact {
  pubkey: string;
  added_at: number;
}

export interface RecoverySettings {
  owner_pubkey: string;
  threshold: number;
  contacts: RecoveryContact[];
}

export interface RotationRequest {
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
