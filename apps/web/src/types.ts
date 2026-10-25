// Type definitions for the Wavvon web client.
//
// These map to the JSON shapes returned by hub HTTP endpoints. The shared
// ones live in @wavvon/core; what stays here is web-only.

// The hub's wire shapes live in @wavvon/core so there is one copy rather than
// three (Wavvon-clients#60). Re-exported here because every call site in this
// app already imports from this module.
export type {
  RoleInfo,
  RoleCategory,
  FavoriteHub,
  Attachment,
  PresenceStatus,
  Reaction,
  MemberAdminInfo,
  BanInfo,
  VoiceMuteInfo,
  PendingUser,
  Conversation,
  DmMessage,
  DmMessageFull,
  AllianceInfo,
  AllianceMemberInfo,
  AllianceDetail,
  AllianceInvite,
  WsScreenShareStarted,
  WsScreenShareChunkOut,
  WsScreenShareStopped,
  SyncResult,
  PendingAllianceInvite,
  LobbyStatus,
  ChallengePrompt,
  ChallengeResult,
  SurveyChoice,
  SurveyQuestion,
  Survey,
  SurveyAnswer,
  SurveySubmitResult,
  SurveyChoiceAdmin,
  SurveyQuestionAdmin,
  SurveyAdmin,
  SurveyResponseAdmin,
  HubCertification,
  BlockEntry,
  IgnoreEntry,
  AppOpenEvent,
  AppCloseEvent,
  CertPayload,
  MeInfo,
  InviteInfo,
  AllianceSharedChannel,
  BadgePayload,
  HubBadge,
  PendingBadgeOffer,
  WsScreenShareOfferOut,
  WsScreenShareOfferIn,
  WsScreenShareAnswerOut,
  WsScreenShareAnswerIn,
  WsScreenShareIceOut,
  WsScreenShareIceIn,
  WsScreenShareViewerJoined,
  WsScreenShareViewerLeft,
} from "@wavvon/core";

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
  /** Forum channels only (forum.md §10.1): require at least one tag on new posts. */
  forum_require_tag?: boolean;
}

export interface RemoteAttachment {
  /** upload_files row id — referenced by e.g. a banner channel's banner_file_id. */
  id: string;
  url: string;
  filename: string;
  size_bytes: number;
  mime_type: string;
}

export type { PinnedMessageEntry as PinnedMessage } from "@wavvon/ui";

import type { BadgeSummary, UserProfile } from "@wavvon/ui";
export type { BadgeSummary, UserProfile };

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

export type { ReplyContext, Message, User } from "@wavvon/ui";

export type { NotifyMode } from "@wavvon/ui";

export type { Hub } from "@wavvon/ui";

export type { ChannelRoleOverwrites, ChannelRolePermissions, ChannelPermissionsResponse } from "@wavvon/ui";

export interface SoundboardClip {
  id: string;
  name: string;
  emoji: string | null;
  uploader: string;
  size_bytes: number;
  duration_ms: number;
  created_at: number;
}

export type { Friend } from "@wavvon/ui";

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

export type { PublicHubEntry, PublicHubProfile } from "@wavvon/ui";

export type { ActiveStream } from "@wavvon/ui";

export type { HubStreamInfo } from "@wavvon/ui";

export interface ScreenShareOpts {
  includeAudio: boolean;
  includeWebcam: boolean;
  webcamDeviceId: string;
}

// ---- Security Level Lobby ----

// ---- Admission challenge ----

// ---- Role Questionnaire / Onboarding Survey ----

// ---- Rich message content ----

export type {
  Embed, EmbedField, ComponentRow, MessageComponent, MessageButton, MessageSelect,
  SelectOption, AppCommandDef, AppProfile,
} from "@wavvon/ui";

// ---- Webhooks ----

export type { WebhookInfo, WebhookCreatedResult } from "@wavvon/ui";

// ---- Event subscriptions + outgoing webhooks ----
//
// Shared, since the manager moved into packages/ui for desktop parity.

export type {
  EventSubscription,
  OutgoingWebhookSummary,
  OutgoingWebhookCreatedResult,
  OutgoingWebhookDelivery,
} from "@wavvon/ui";

// ---- Forum ----

export type {
  ReactionCount,
  ForumAttachment,
  TagRef,
  ForumTagDef,
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

// ---- Hub Certifications ----

export type { CertIssuance, CertAdmissionSettings } from "@wavvon/ui";

// ---- Identity Recovery ----

import type { RecoveryContactItem } from "@wavvon/ui";
export type { RecoveryContactItem, RecoveryAdminRequest, RecoveryRequestBundle } from "@wavvon/ui";

export interface RecoverySettings {
  owner_pubkey: string;
  threshold: number;
  contacts: RecoveryContactItem[];
}

// ---- Block / Ignore / DND ----

// ---- Link Preview ----

export type { LinkPreview } from "@wavvon/ui";

// ---- Mini-app events ----

export type { AppLaunchEvent } from "@wavvon/ui";

// ---- WebRTC Screen Share v2 ----

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
