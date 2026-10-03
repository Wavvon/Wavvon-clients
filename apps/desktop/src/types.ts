// Shared type definitions for the Wavvon desktop client.
//
// These map to the JSON shapes returned by Tauri commands and hub
// HTTP endpoints. Keep them in sync with the Rust side; a renamed
// field in src-tauri or server/wavvon-hub means a rename here too.

// Channel is shared with the channel-tree helpers in @wavvon/utils.
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

export type { Channel } from "@wavvon/core";

export interface HubIcon {
  id: string;
  name: string;
  svg_content: string;
  uploaded_by: string;
  created_at: number;
}

import type { Message } from "@wavvon/ui";
export type { ReplyContext, Message, User } from "@wavvon/ui";

export type { NotifyMode } from "@wavvon/ui";
export type { SoundboardClip } from "@wavvon/ui";

export interface VoiceParticipant {
  public_key: string;
  display_name: string | null;
}

export type { Hub } from "@wavvon/ui";

import type { Friend, UserProfile, BadgeSummary, PublicHubEntry, PublicHubProfile } from "@wavvon/ui";
export type { Friend, UserProfile, BadgeSummary, PublicHubEntry, PublicHubProfile };

export interface WsStreamSubscribed {
  type: "stream_subscribed";
  source_channel_id: string;
  stream_id: string;
  sharer_pubkey: string;
  kind: string;
  mime: string;
  has_audio: boolean;
}

export interface WsStreamSubscriptionEnded {
  type: "stream_subscription_ended";
  source_channel_id: string;
  stream_id: string;
}

import type { HubStreamInfo } from "@wavvon/ui";
export type { HubStreamInfo };

export interface WsHubStreams {
  type: "hub_streams";
  streams: HubStreamInfo[];
}

export type { ActiveStream } from "@wavvon/ui";

export interface ScreenShareOpts {
  sourceId?: string;
  includeAudio: boolean;
  includeWebcam: boolean;
  webcamDeviceId: string;
}

// ---- Security Level Lobby ----

// ---- Admission challenge ----

// ---- Role Questionnaire / Onboarding Survey ----

// ---- Rich message content ----

export type {
  Embed, EmbedField, ComponentRow, MessageComponent, MessageButton, MessageSelect, SelectOption,
} from "@wavvon/ui";

// ---- App profile ----

export type { AppCommandDef, AppProfile } from "@wavvon/ui";

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

// ---- channel_type ----

export type ChannelType = "text" | "forum" | "banner";

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

// ---- Server tags / badges ----

// ---- Hub certifications ----

export interface IssuedCertRow {
  id: string;
  subject_pubkey: string;
  subject_display: string | null;
  issued_at: number;
  expires_at: number;
  standing: "good" | "revoked";
}

export interface CertSettings {
  cert_mode: "none" | "any" | "trusted";
  cert_auto_issue: boolean;
  cert_min_age_days: number;
  cert_validity_days: number;
  cert_trusted_issuers: string[];
  /** issuer pubkey → base URL, for issuers this hub can pull a portfolio
   *  from (hub-certifications.md §11). Sparse: an issuer without an
   *  address is still trusted, just not pullable. Absent from hubs that
   *  predate the field. */
  cert_issuer_urls?: Record<string, string>;
}

// ---- Block / Ignore / DND ----

export interface DndSettings {
  active: boolean;
  start_hour: number | null;
  end_hour: number | null;
}

// ---- Device list ----

export interface PairedDevice {
  subkey_pubkey: string;
  device_label: string;
  issued_at: number;
  not_after: number | null;
  is_this_device: boolean;
}

// ---- Admin audit log ----

export interface AuditEntry {
  id: string;
  ts: number;
  actor_pubkey: string;
  action: string;
  target: string | null;
  detail: string | null;
}

// ---- WebRTC screen share ----

export interface HubListing {
  name: string;
  description: string | null;
  public_key: string;
  hub_url: string;
  tags: string[];
  member_count_approx: number;
  listed: boolean;
}

// ---- File upload result ----

export interface UploadedAttachment {
  url: string;
  filename: string;
  size_bytes: number;
  mime_type: string;
}

// ---- Message pinning: shared PinnedMessageEntry in @wavvon/ui ----

// ---- User profile card ----

// ---- Polls ----

export type { PollOption, Poll, RsvpStatus, EventRsvp, EventSlot, HubEvent, EventMoveAssignment } from "@wavvon/ui";

// ---- Link preview ----

export type { LinkPreview } from "@wavvon/ui";

// ---- Typed Tauri errors ----

export type AppError = {
  code: "NotFound" | "Forbidden" | "RateLimit" | "Network" | "Internal";
  message: string;
};

export interface TauriFile extends File {
  path?: string;
}

// ---- Mini-app events ----

export type { AppLaunchEvent } from "@wavvon/ui";
