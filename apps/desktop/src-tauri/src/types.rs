#![allow(dead_code)]
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Typed command errors
// ---------------------------------------------------------------------------

#[derive(Debug, serde::Serialize)]
#[serde(tag = "code", content = "message")]
pub(crate) enum AppError {
    NotFound(String),
    Forbidden(String),
    RateLimit(String),
    Network(String),
    Internal(String),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::NotFound(m) => write!(f, "NotFound: {m}"),
            AppError::Forbidden(m) => write!(f, "Forbidden: {m}"),
            AppError::RateLimit(m) => write!(f, "RateLimit: {m}"),
            AppError::Network(m) => write!(f, "Network: {m}"),
            AppError::Internal(m) => write!(f, "Internal: {m}"),
        }
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        AppError::Network(e.to_string())
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError::Internal(s)
    }
}

pub(crate) fn map_http_status(status: reqwest::StatusCode, body: String) -> AppError {
    match status.as_u16() {
        404 => AppError::NotFound(body),
        403 => AppError::Forbidden(body),
        429 => AppError::RateLimit(body),
        _ => AppError::Internal(body),
    }
}

// ---------------------------------------------------------------------------
// Hub / session DTOs
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct HubInfo {
    pub hub_id: String,
    pub hub_name: String,
    pub hub_url: String,
    pub hub_icon: Option<String>,
    pub is_active: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SavedHub {
    pub hub_id: String,
    pub hub_name: String,
    pub hub_url: String,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct InfoResponse {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    pub public_key: String,
    #[serde(default)]
    pub farm_url: Option<String>,
    #[serde(default)]
    pub welcome_label: Option<String>,
    #[serde(default)]
    pub welcome_invite_url: Option<String>,
    #[serde(default)]
    pub timezone: Option<String>,
    #[serde(default = "default_birthdays_enabled")]
    pub birthdays_enabled: bool,
}

pub(crate) fn default_birthdays_enabled() -> bool {
    true
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct RoleInfo {
    pub id: String,
    pub name: String,
    pub permissions: Vec<String>,
    pub priority: i64,
    #[serde(default)]
    pub display_separately: bool,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub category_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct RoleCategory {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    pub position: i64,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct MeInfo {
    pub public_key: String,
    pub display_name: Option<String>,
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default = "default_approval_status")]
    pub approval_status: String,
    pub roles: Vec<RoleInfo>,
    #[serde(default)]
    pub birthday: Option<String>,
}

pub(crate) fn default_approval_status() -> String {
    "approved".to_string()
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct HubBranding {
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    #[serde(default)]
    pub welcome_label: Option<String>,
    #[serde(default)]
    pub welcome_invite_url: Option<String>,
    /// Member-facing (unlike the rest of this admin-overview struct): read by
    /// every joined member for the ambient hub-local clock, not just admins.
    #[serde(default)]
    pub timezone: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct HubSettings {
    pub require_approval: bool,
    pub invite_only: bool,
    pub min_security_level: u32,
    pub max_channel_depth: u32,
    #[serde(default)]
    pub default_invite_role_id: Option<String>,
    #[serde(default)]
    pub timezone: Option<String>,
    #[serde(default = "default_birthdays_enabled")]
    pub birthdays_enabled: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct PendingUser {
    pub public_key: String,
    pub display_name: Option<String>,
    pub first_seen_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct ChannelInfo {
    pub id: String,
    pub name: String,
    pub created_by: String,
    pub parent_id: Option<String>,
    pub is_category: bool,
    pub channel_type: String,
    pub display_order: i64,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub custom_icon_svg: Option<String>,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub banner_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub banner_file_id: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct HubIcon {
    pub id: String,
    pub name: String,
    pub svg_content: String,
    pub uploaded_by: String,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct UserInfo {
    pub public_key: String,
    pub display_name: Option<String>,
    #[serde(default)]
    pub avatar: Option<String>,
    pub online: bool,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub status_custom: Option<String>,
    #[serde(default)]
    pub group_role: Option<String>,
    #[serde(default)]
    pub is_bot: bool,
    #[serde(default)]
    pub birthday: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct BotInfo {
    pub public_key: String,
    pub display_name: String,
    pub created_by: String,
    pub created_at: i64,
    pub token: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct FriendInfo {
    pub public_key: String,
    pub display_name: Option<String>,
    pub since: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct ConversationInfo {
    pub id: String,
    pub conv_type: String,
    pub members: Vec<String>,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct DmMessageInfo {
    pub id: String,
    pub conversation_id: String,
    pub sender: String,
    pub sender_name: Option<String>,
    pub content: String,
    pub created_at: i64,
    #[serde(default)]
    pub attachments: Vec<AttachmentInfo>,
    #[serde(default)]
    pub is_encrypted: bool,
    #[serde(default)]
    pub is_group_encrypted: bool,
    #[serde(default)]
    pub delivery_failed: bool,
}

/// Raw response from the hub for a DM message — may include an encrypted envelope.
/// Converted to `DmMessageInfo` after optional in-process decryption.
#[derive(Deserialize)]
pub(crate) struct RawDmMessageResponse {
    pub id: String,
    pub conversation_id: String,
    pub sender: String,
    pub sender_name: Option<String>,
    pub content: Option<String>,
    pub created_at: i64,
    #[serde(default)]
    pub attachments: Vec<AttachmentInfo>,
    #[serde(default)]
    pub is_encrypted: bool,
    #[serde(default)]
    pub is_group_encrypted: bool,
    #[serde(default)]
    pub delivery_failed: bool,
    pub encrypted_envelope: Option<serde_json::Value>,
    pub group_encrypted_envelope: Option<serde_json::Value>,
    /// DR v2 envelope — present when `encrypted_envelope.v == 2`.
    #[serde(default)]
    pub dr_envelope: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct AttachmentInfo {
    pub name: String,
    pub mime: String,
    pub data_b64: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct ReactionInfo {
    pub emoji: String,
    pub count: i64,
    pub me: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct ReplyContextInfo {
    pub message_id: String,
    pub sender: String,
    pub sender_name: Option<String>,
    pub content_preview: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct MessageInfo {
    pub id: String,
    pub channel_id: String,
    pub sender: String,
    pub sender_name: Option<String>,
    pub content: String,
    pub created_at: i64,
    #[serde(default)]
    pub edited_at: Option<i64>,
    #[serde(default)]
    pub attachments: Vec<AttachmentInfo>,
    #[serde(default)]
    pub reactions: Vec<ReactionInfo>,
    #[serde(default)]
    pub reply_to: Option<ReplyContextInfo>,
}

// ---------------------------------------------------------------------------
// Audio device list
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub(crate) struct AudioDeviceList {
    pub inputs: Vec<String>,
    pub outputs: Vec<String>,
}

// ---------------------------------------------------------------------------
// Voice types
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
pub(crate) struct AttenuationConfigInfo {
    #[serde(default = "default_attenuation_model")]
    pub model: String,
    #[serde(default = "default_max_radius")]
    pub max_radius: f64,
    #[serde(default = "default_ref_dist")]
    pub ref_dist: f64,
    #[serde(default = "default_rolloff")]
    pub rolloff: f64,
}

pub(crate) fn default_attenuation_model() -> String {
    "linear".to_string()
}
pub(crate) fn default_max_radius() -> f64 {
    200.0
}
pub(crate) fn default_ref_dist() -> f64 {
    20.0
}
pub(crate) fn default_rolloff() -> f64 {
    1.0
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
pub(crate) struct VoiceZoneSnapshotInfo {
    pub zone_id: String,
    pub name: String,
    pub coordinate_system: String,
    pub attenuation: AttenuationConfigInfo,
    pub positions: HashMap<String, Vec<f64>>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct VoiceParticipantInfo {
    pub public_key: String,
    pub display_name: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct VoiceRosterEntryInfo {
    pub sender_id: u16,
    pub public_key: String,
    #[serde(default)]
    pub display_name: Option<String>,
}

// ---------------------------------------------------------------------------
// Admin / moderation types
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct BanInfo {
    pub target_public_key: String,
    pub banned_by: String,
    pub reason: Option<String>,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct MemberAdminInfo {
    pub public_key: String,
    pub display_name: Option<String>,
    pub online: bool,
    pub first_seen_at: i64,
    pub last_seen_at: i64,
    pub roles: Vec<RoleInfo>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct ChannelBanInfo {
    pub channel_id: String,
    pub target_public_key: String,
    pub banned_by: String,
    pub reason: Option<String>,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct VoiceMuteInfo {
    pub target_public_key: String,
    pub muted_by: String,
    pub reason: Option<String>,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct TalkPowerInfo {
    pub channel_id: String,
    pub min_talk_power: i64,
}

// ---------------------------------------------------------------------------
// Alliance types
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct AllianceInfo {
    pub id: String,
    pub name: String,
    pub created_by: String,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct AllianceMemberInfo {
    pub hub_public_key: String,
    pub hub_name: String,
    pub hub_url: String,
    pub joined_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct AllianceDetail {
    pub id: String,
    pub name: String,
    pub created_by: String,
    pub created_at: i64,
    pub members: Vec<AllianceMemberInfo>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct AllianceInvite {
    pub token: String,
    pub alliance_id: String,
    pub alliance_name: String,
    pub hub_url: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct AllianceSharedChannel {
    pub channel_id: String,
    pub channel_name: String,
    pub hub_public_key: String,
    pub hub_name: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct PendingAllianceInvite {
    pub id: String,
    pub alliance_id: String,
    pub alliance_name: String,
    pub from_hub_url: String,
    pub from_hub_name: String,
    pub from_hub_public_key: String,
    pub invite_token: String,
    pub created_at: i64,
    pub message: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct ProxiedMessage {
    pub id: String,
    pub channel_id: String,
    pub sender: String,
    pub sender_name: Option<String>,
    pub content: String,
    pub created_at: i64,
    pub edited_at: Option<i64>,
    #[serde(default)]
    pub attachments: Vec<AttachmentInfo>,
}

// ---------------------------------------------------------------------------
// Invite types
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct InviteInfo {
    pub code: String,
    pub created_by: String,
    pub max_uses: Option<i64>,
    pub uses: i64,
    pub expires_at: Option<i64>,
    pub created_at: i64,
}

// ---------------------------------------------------------------------------
// Farm types
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct FarmPublicInfo {
    pub kind: Option<String>,
    pub name: String,
    pub description: String,
    pub creation_policy: String,
    pub hub_count: u32,
    pub max_hubs_total: u32,
    pub allow_discovery_listing: bool,
    pub country: String,
    pub region: String,
    pub languages: Vec<String>,
    pub tags: Vec<String>,
    pub icon: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct FarmHubQuota {
    pub hubs_owned_by_user: u32,
    pub max_hubs_per_user: u32,
    pub total_hubs: u32,
    pub max_hubs_total: u32,
    pub can_create: bool,
    pub reason: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct FarmSettings {
    pub name: String,
    pub description: String,
    pub creation_policy: String,
    pub max_hubs_per_user: u32,
    pub max_hubs_total: u32,
    pub allow_discovery_listing: bool,
    pub directory_public: bool,
    pub languages: Vec<String>,
    pub tags: Vec<String>,
    pub country: String,
    pub region: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct CreatedFarmHub {
    pub id: String,
    pub url: String,
    pub hub_pubkey: String,
    pub name: String,
    pub visibility: String,
    pub created_at: i64,
}

// ---------------------------------------------------------------------------
// Recovery contacts
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct RecoveryContact {
    pub pubkey: String,
    pub display_name: Option<String>,
    pub added_at: i64,
    pub hub_url: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct RecoveryContactEntry {
    pub pubkey: String,
    pub added_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct RecoveryContactsResponse {
    pub owner_pubkey: String,
    pub contacts: Vec<RecoveryContactEntry>,
    pub threshold: u32,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct RotationRequest {
    pub id: String,
    pub new_pubkey: String,
    pub hub_url: String,
    pub attestations: Vec<serde_json::Value>,
    pub threshold: i64,
    pub submitted_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct MyRotationRequestResponse {
    pub id: String,
    pub new_pubkey: String,
    pub status: String,
    pub created_at: i64,
    pub attestation_count: i64,
    pub threshold: i64,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct SetContactsPayload {
    pub contacts: Vec<String>,
    pub threshold: u32,
}

// ---------------------------------------------------------------------------
// Survey / questionnaire types
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SurveyChoiceTs {
    pub id: String,
    pub label: String,
    pub display_order: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SurveyQuestionTs {
    pub id: String,
    pub prompt: String,
    pub kind: String,
    pub required: bool,
    pub display_order: i64,
    pub choices: Option<Vec<SurveyChoiceTs>>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SurveyPublicTs {
    pub id: String,
    pub questions: Vec<SurveyQuestionTs>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SurveyChoiceAdminTs {
    pub id: String,
    pub label: String,
    pub display_order: i64,
    pub role_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SurveyQuestionAdminTs {
    pub id: String,
    pub prompt: String,
    pub kind: String,
    pub required: bool,
    pub display_order: i64,
    pub choices: Option<Vec<SurveyChoiceAdminTs>>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SurveyAdminTs {
    pub id: String,
    pub enabled: bool,
    pub questions: Vec<SurveyQuestionAdminTs>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SurveyAnswer {
    pub question_id: String,
    pub choice_id: Option<String>,
    pub text_answer: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SurveySubmitResult {
    pub next_state: String,
    pub applied_roles: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SurveyAnswerView {
    pub question_id: String,
    pub prompt: String,
    pub choice_label: Option<String>,
    pub text_answer: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SurveyResponseAdminTs {
    pub response_id: String,
    pub pubkey: String,
    pub display_name: Option<String>,
    pub submitted_at: i64,
    pub answers: Vec<SurveyAnswerView>,
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct LobbyStatusResult {
    pub status: String,
    pub required_level: u32,
    pub current_level: u32,
    pub entered_at: Option<i64>,
    pub welcome_md: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct LobbySubmitResult {
    pub promoted: bool,
    pub new_level: u32,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct LobbyWelcome {
    pub welcome_md: String,
    pub hub_name: String,
    pub required_level: u32,
}

// ---------------------------------------------------------------------------
// Challenge
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct ChallengePrompt {
    pub id: String,
    pub mode: String,
    pub prompt_svg: Option<String>,
    pub expires_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct ChallengeResult {
    pub ok: bool,
    pub token: Option<String>,
    pub expires_at: Option<i64>,
    pub next_challenge: Option<ChallengePrompt>,
    pub attempts_remaining: Option<u32>,
}

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct BotAdminInfo {
    pub public_key: String,
    pub display_name: String,
    pub created_by: String,
    pub created_at: i64,
    pub webhook_url: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct BotCreatedResult {
    pub public_key: String,
    pub display_name: String,
    pub created_by: String,
    pub created_at: i64,
    pub token: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct BotSlashCommandInfo {
    pub command: String,
    pub description: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct BotDetailInfo {
    pub public_key: String,
    pub display_name: String,
    pub created_by: String,
    pub created_at: i64,
    pub webhook_url: Option<String>,
    pub commands: Vec<BotSlashCommandInfo>,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct BotCommandDef {
    pub name: String,
    pub description: String,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct BotProfileResult {
    pub pubkey: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub description: Option<String>,
    pub commands: Vec<BotCommandDef>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct ExternalBotRow {
    pub public_key: String,
    pub display_name: Option<String>,
    pub local_note: Option<String>,
    pub approval_status: String,
    pub last_seen_at: Option<i64>,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct ExternalBotInviteResult {
    pub bot_invite_token: String,
    pub pubkey: String,
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct WebhookInfo {
    pub id: String,
    pub display_name: String,
    pub channel_id: String,
    pub channel_name: Option<String>,
    pub webhook_url: String,
    pub created_by: String,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct WebhookCreatedResult {
    pub id: String,
    pub webhook_url: String,
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub(crate) struct UploadResult {
    pub url: String,
    pub filename: String,
    pub size_bytes: u64,
    pub mime_type: String,
    pub file_id: String,
}

// ---------------------------------------------------------------------------
// Screen share / capture
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
pub struct CaptureSource {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub thumbnail_b64: String,
}

// ---------------------------------------------------------------------------
// WS server messages
// ---------------------------------------------------------------------------

#[derive(serde::Deserialize)]
#[serde(tag = "type")]
#[allow(dead_code)]
pub(crate) enum WsServerMessage {
    #[serde(rename = "message")]
    ChatMessage {
        channel_id: String,
        message: MessageInfo,
    },
    #[serde(rename = "message_edited")]
    MessageEdited {
        channel_id: String,
        message: MessageInfo,
    },
    #[serde(rename = "message_deleted")]
    MessageDeleted {
        channel_id: String,
        message_id: String,
    },
    #[serde(rename = "reactions_updated")]
    ReactionsUpdated {
        channel_id: String,
        message_id: String,
        reactions: Vec<ReactionInfo>,
    },
    #[serde(rename = "typing")]
    Typing {
        channel_id: String,
        public_key: String,
        display_name: Option<String>,
        typing: bool,
    },
    /// A user changed their presence status. `status` is None for plain
    /// online (away/dnd otherwise); `custom` is optional short status text.
    #[serde(rename = "member_status")]
    MemberStatus {
        public_key: String,
        #[serde(default)]
        status: Option<String>,
        #[serde(default)]
        custom: Option<String>,
    },
    /// Hub-pushed voice_move (events.md §7.1) — targeted-by-pubkey, like whisper.
    /// `target_channel_name` is used as-is; the destination may not be in the
    /// local channel list (a voice-only-presence target has no read access).
    #[serde(rename = "voice_move")]
    VoiceMove {
        #[serde(default)]
        target_channel_id: Option<String>,
        #[serde(default)]
        target_channel_name: Option<String>,
        #[serde(default)]
        source_channel_id: Option<String>,
        #[serde(default)]
        event_id: Option<String>,
        #[serde(default)]
        auto: Option<bool>,
    },
    #[serde(rename = "voice_joined")]
    VoiceJoined {
        channel_id: String,
        hub_udp_port: u16,
        participants: Vec<VoiceParticipantInfo>,
        #[serde(default)]
        udp_register_token: Option<String>,
    },
    #[serde(rename = "voice_participant_joined")]
    VoiceParticipantJoined {
        channel_id: String,
        participant: VoiceParticipantInfo,
    },
    #[serde(rename = "voice_participant_left")]
    VoiceParticipantLeft {
        channel_id: String,
        public_key: String,
    },
    #[serde(rename = "voice_participant_speaking")]
    VoiceParticipantSpeaking {
        channel_id: String,
        public_key: String,
        speaking: bool,
    },
    #[serde(rename = "error")]
    Error { context: String, message: String },
    #[serde(rename = "dm")]
    DirectMessage {
        conversation_id: String,
        sender: String,
        sender_name: Option<String>,
        content: String,
        timestamp: i64,
    },
    #[serde(rename = "dm_typing")]
    DmTyping {
        conversation_id: String,
        sender: String,
        sender_name: Option<String>,
        typing: bool,
    },
    #[serde(rename = "dm_member_changed")]
    DmMemberChanged {
        conversation_id: String,
        added: Vec<String>,
        removed: Vec<String>,
    },
    #[serde(rename = "voice_roster_update")]
    VoiceRosterUpdate {
        channel_id: String,
        participants: Vec<VoiceRosterEntryInfo>,
    },
    #[serde(rename = "voice_zone_created")]
    VoiceZoneCreated {
        channel_id: String,
        zone_id: String,
        name: String,
        coordinate_system: String,
        attenuation: AttenuationConfigInfo,
    },
    #[serde(rename = "voice_zone_destroyed")]
    VoiceZoneDestroyed { channel_id: String, zone_id: String },
    #[serde(rename = "voice_position_updated")]
    VoicePositionUpdated {
        channel_id: String,
        zone_id: String,
        pubkey: String,
        position: Vec<f64>,
    },
    #[serde(rename = "voice_zone_state")]
    VoiceZoneState {
        channel_id: String,
        zones: Vec<VoiceZoneSnapshotInfo>,
    },
    #[serde(rename = "video_participant_enabled")]
    VideoParticipantEnabled { channel_id: String, pubkey: String },
    #[serde(rename = "video_participant_disabled")]
    VideoParticipantDisabled { channel_id: String, pubkey: String },
    #[serde(rename = "video_participants")]
    VideoParticipants {
        channel_id: String,
        pubkeys: Vec<String>,
    },
    #[serde(rename = "video_offer_in")]
    VideoOfferIn {
        channel_id: String,
        from_pubkey: String,
        to_pubkey: String,
        sdp: String,
    },
    #[serde(rename = "video_answer_in")]
    VideoAnswerIn {
        channel_id: String,
        from_pubkey: String,
        to_pubkey: String,
        sdp: String,
    },
    #[serde(rename = "video_ice_in")]
    VideoIceIn {
        channel_id: String,
        from_pubkey: String,
        to_pubkey: String,
        candidate: String,
    },
    #[serde(rename = "poll_vote_updated")]
    PollVoteUpdated {
        channel_id: String,
        poll_id: String,
        totals: std::collections::HashMap<String, serde_json::Value>,
    },
    #[serde(rename = "voice_whisper_started")]
    VoiceWhisperStarted { sender_pubkey: String },
    #[serde(rename = "voice_whisper_stopped")]
    VoiceWhisperStopped { sender_pubkey: String },
    #[serde(rename = "bot_app_launch")]
    BotAppLaunch {
        bot_id: String,
        title: String,
        description: String,
        channel_id: String,
    },
    #[serde(rename = "bot_app_open")]
    BotAppOpen {
        bot_id: String,
        channel_id: String,
        mini_app_url: String,
        session_token: String,
    },
    #[serde(rename = "bot_app_close")]
    BotAppClose { bot_id: String, channel_id: String },
    #[serde(other)]
    Other,
}

// ---------------------------------------------------------------------------
// Link preview
// ---------------------------------------------------------------------------

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub(crate) struct LinkPreviewInfo {
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub image_url: Option<String>,
}

// ---------------------------------------------------------------------------
// Public profile
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize)]
pub(crate) struct PublicHubEntryInput {
    pub hub_url: String,
    pub hub_name: String,
    pub joined_at: u64,
}
