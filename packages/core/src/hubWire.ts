// The hub's HTTP and WebSocket response shapes, in one place.
//
// These were declared twice — `apps/web/src/types.ts` and
// `apps/desktop/src/types.ts` each carried its own copy — plus a third partial
// set in `packages/ui/src/types.ts`. 36 of the shared names were identical and
// the rest had drifted, which matters because they describe the same hub JSON
// and so cannot both be right (Wavvon-clients#60).
//
// They live in `core` rather than `ui` because they are wire shapes with no
// React in them: reading what a hub served should not require a component
// library. `ui` and both apps re-export from here.
//
// Reconciled against the hub's own serializers, not against each other. Where
// the two copies disagreed, the web one was almost always the current shape
// and the desktop one a subset left behind — except the badges, where both
// were wrong; see `HubBadge` and `PendingBadgeOffer` below.

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

export interface FavoriteHub {
  url: string;
  name: string;
  icon: string | null;
}

export interface Attachment {
  name: string;
  mime: string;
  data_b64: string;
}

// Own presence state. "invisible" = connected but shown offline to others.
export type PresenceStatus = "online" | "away" | "dnd" | "invisible";

export interface Reaction {
  emoji: string;
  count: number;
  me: boolean;
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

export interface PendingUser {
  public_key: string;
  display_name: string | null;
  first_seen_at: number;
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

export interface LobbyStatus {
  status: "lobby" | "promoted" | "member";
  required_level: number;
  current_level: number;
  entered_at: number | null;
  welcome_md: string | null;
}

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

export interface HubCertification {
  payload: CertPayload;
  signature: string;
}

export interface BlockEntry {
  pubkey: string;
  since: number;
}

export interface IgnoreEntry {
  pubkey: string;
  since: number;
}

export interface AppOpenEvent {
  type: 'app_open';
  app_id: string;
  channel_id: string;
  mini_app_url: string;
  session_token: string;
  requires_camera: boolean;
}

export interface AppCloseEvent {
  type: 'app_close';
  app_id: string;
  channel_id: string;
}


// --- Reconciled: the copies disagreed, these are what the hub serves --------

/// `routes/certs.rs::CertPayload`. The desktop copy stopped at `capabilities`
/// and could not see that a cert carrying `label` is an achievement badge.
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
  /** Present → this cert is an achievement badge rather than a membership one. */
  label?: string | null;
  description?: string | null;
  icon?: string | null;
}

/// `routes/me.rs::MeResponse`. The desktop copy had five of the fifteen
/// fields, so everything from `bio` to `name_color` was invisible there.
export interface MeInfo {
  public_key: string;
  display_name: string | null;
  avatar: string | null;
  bio: string | null;
  pronouns: string | null;
  status_message: string | null;
  activities: string | null;
  accent_color: string | null;
  name_color: string | null;
  cover: string | null;
  favorite_hubs: FavoriteHub[];
  show_hubs: boolean;
  approval_status: "approved" | "pending";
  roles: RoleInfo[];
  birthday: string | null;
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
  /** The one identity this invite admits, or null for a bearer code. Only on
   *  hubs advertising `invites.bound`; absent reads as null. */
  bound_pubkey: string | null;
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

// --- Badges: both copies were wrong ----------------------------------------

/// What an issuer signs. `routes/badges.rs::BadgePayload` — note the
/// timestamps are **strings** here, which is what made the flat numeric
/// `issued_at` in the old web copy unreadable.
export interface BadgePayload {
  issuer_pubkey: string;
  issuer_url: string;
  subject_pubkey: string;
  label: string;
  issued_at: string;
  expires_at: string | null;
}

/// `GET /badges` → `routes/badges.rs::HeldBadgeResponse`.
///
/// The web copy had flat `issued_at`/`expires_at` numbers and a top-level
/// `signature`, none of which this endpoint serves, and no `payload` at all.
/// The desktop copy was `BadgeEnvelope` — the `{payload, signature}` shape
/// `/info` carries, a different endpoint entirely — so `list_badges` there was
/// typed as something the hub never sends.
export interface HubBadge {
  id: string;
  issuer_pubkey: string;
  issuer_url: string;
  label: string;
  payload: BadgePayload;
  accepted_at: number;
}

/// `GET /badges/pending` → `routes/badges.rs::PendingBadgeResponse`.
///
/// The offer names the hub it came **from**, and that is a different field
/// name from the one on an accepted badge. Every copy of this type had
/// `issuer_url`, so the admin screen rendered "from undefined" for every
/// pending offer.
export interface PendingBadgeOffer {
  id: string;
  from_hub_pubkey: string;
  from_hub_url: string;
  label: string;
  note: string | null;
  payload: BadgePayload;
  created_at: number;
}

// --- Screen share signalling: the same four names meant two things ----------
//
// `WsScreenShareOffer` was `screen_share_offer_in` on web and
// `screen_share_offer` on desktop. Those are not a drift and not a rename:
// the hub serves **both**, one in each direction (`routes/chat_models.rs`),
// and the two apps had each declared the half they happened to need under the
// shared name. Direction is in the name now, and both halves exist once.
//
// Reconciling them turned up three more mismatches: every inbound message
// carries `to_pubkey`, which the web copies dropped; `screen_share_viewer_joined`
// identifies the viewer as `from_pubkey`, which desktop called `viewer_pubkey`;
// and the outbound messages carry no `from_pubkey` at all, because the hub
// takes the sender from the session rather than the body.

/** Client → hub. No `from_pubkey`: the hub uses the session's identity. */
export interface WsScreenShareOfferOut {
  type: "screen_share_offer";
  channel_id: string;
  to_pubkey: string;
  stream_id: string;
  /** Opaque SDP text — the hub does not parse it. */
  sdp: string;
}

/** Hub → client, forwarded to the target viewer. `from_pubkey` is the sharer. */
export interface WsScreenShareOfferIn {
  type: "screen_share_offer_in";
  channel_id: string;
  to_pubkey: string;
  stream_id: string;
  sdp: string;
  from_pubkey: string;
}

export interface WsScreenShareAnswerOut {
  type: "screen_share_answer";
  channel_id: string;
  to_pubkey: string;
  stream_id: string;
  sdp: string;
}

/** Hub → client, forwarded to the sharer. `from_pubkey` is the viewer. */
export interface WsScreenShareAnswerIn {
  type: "screen_share_answer_in";
  channel_id: string;
  to_pubkey: string;
  stream_id: string;
  sdp: string;
  from_pubkey: string;
}

export interface WsScreenShareIceOut {
  type: "screen_share_ice";
  channel_id: string;
  to_pubkey: string;
  stream_id: string;
  /** JSON string: `{ candidate, sdpMid, sdpMLineIndex }` — opaque to the hub. */
  candidate: string;
}

export interface WsScreenShareIceIn {
  type: "screen_share_ice_in";
  channel_id: string;
  to_pubkey: string;
  stream_id: string;
  candidate: string;
  from_pubkey: string;
}

/** Hub → sharer: a viewer wants to negotiate. The viewer is `from_pubkey`. */
export interface WsScreenShareViewerJoined {
  type: "screen_share_viewer_joined";
  channel_id: string;
  stream_id: string;
  from_pubkey: string;
}

/** Hub → sharer: a viewer left. Same shape as the join. */
export interface WsScreenShareViewerLeft {
  type: "screen_share_viewer_left";
  channel_id: string;
  stream_id: string;
  from_pubkey: string;
}
