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
    pub farewell_label: Option<String>,
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
    pub farewell_label: Option<String>,
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
    #[serde(default)]
    pub afk_channel_id: Option<String>,
    #[serde(default = "default_afk_timeout_secs")]
    pub afk_timeout_secs: u32,
    #[serde(default = "default_name_color_mode")]
    pub name_color_mode: String,
}

pub(crate) fn default_afk_timeout_secs() -> u32 {
    300
}

pub(crate) fn default_name_color_mode() -> String {
    "role_over_user".to_string()
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
    /// Per-channel NSFW flag (distinct from the hub-wide discovery `nsfw` tag).
    #[serde(default)]
    pub nsfw: bool,
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
    /// Final, server-resolved name color per the hub's `name_color_mode` —
    /// rendered as-is, no client-side priority logic.
    #[serde(default)]
    pub name_color: Option<String>,
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

/// One encrypted voice sender-key bundle destined for a single recipient
/// (voice-transport-v2.md). Carried inside the outbound `voice_key_offer`
/// and forwarded verbatim by the hub as `voice_key_received`.
#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct VoiceKeyBundleInfo {
    pub recipient_pubkey: String,
    pub ciphertext_hex: String,
    pub nonce_hex: String,
}

// ---------------------------------------------------------------------------
// Admin / moderation types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Alliance types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Invite types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Recovery contacts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Survey / questionnaire types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Challenge
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Screen share / capture
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// WS server messages
// ---------------------------------------------------------------------------

#[derive(serde::Deserialize)]
#[serde(tag = "type")]
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
        participants: Vec<VoiceParticipantInfo>,
        /// Single-use token presented when opening the WebTransport session
        /// (`voice_wt_url?token=<hex>`); renamed from `udp_register_token`
        /// (voice-transport-v2.md, alpha -- no compat).
        voice_token: String,
        /// Absolute `https://host:port/voice` WebTransport voice endpoint.
        voice_wt_url: String,
        /// Hex SHA-256 digest of the WT endpoint's certificate, when the
        /// hub is on the self-signed tier; `None` for a CA-issued cert.
        #[serde(default)]
        voice_cert_hash: Option<String>,
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
        zone_id: String,
        attenuation: AttenuationConfigInfo,
    },
    #[serde(rename = "voice_zone_destroyed")]
    VoiceZoneDestroyed { zone_id: String },
    #[serde(rename = "voice_position_updated")]
    VoicePositionUpdated {
        zone_id: String,
        pubkey: String,
        position: Vec<f64>,
    },
    #[serde(rename = "voice_zone_state")]
    VoiceZoneState { zones: Vec<VoiceZoneSnapshotInfo> },
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
    /// Targeted delivery of another participant's encrypted sender-key
    /// bundle (voice-transport-v2.md). Forwarded by the hub verbatim from
    /// that participant's `voice_key_offer`.
    #[serde(rename = "voice_key_received")]
    VoiceKeyReceived {
        channel_id: String,
        from_pubkey: String,
        ciphertext_hex: String,
        nonce_hex: String,
    },
    /// Broadcast to existing voice participants: a new sender joined and
    /// needs each participant to send it their current sender key.
    #[serde(rename = "voice_key_request")]
    VoiceKeyRequest {
        channel_id: String,
        new_pubkey: String,
    },
    #[serde(rename = "app_launch")]
    AppLaunch {
        app_id: String,
        title: String,
        description: String,
        channel_id: String,
    },
    #[serde(rename = "app_open")]
    AppOpen {
        app_id: String,
        channel_id: String,
        mini_app_url: String,
        session_token: String,
    },
    #[serde(rename = "app_close")]
    AppClose { app_id: String, channel_id: String },
    /// Hub branding/settings changed; re-fetch the hub info.
    #[serde(rename = "hub_updated")]
    HubUpdated,
    /// The channel list changed; re-fetch /channels.
    #[serde(rename = "channels_updated")]
    ChannelsUpdated,
    /// A member's profile changed. Only the fields mirrored elsewhere (member
    /// list, message authors) ride along; richer profile fields are fetched
    /// live when a card opens.
    #[serde(rename = "member_updated")]
    MemberUpdated {
        public_key: String,
        display_name: Option<String>,
        avatar: Option<String>,
        #[serde(default)]
        name_color: Option<String>,
    },
    /// Soundboard clip-played attribution — drives the transient
    /// "🔊 X played *name*" chip in the voice roster.
    #[serde(rename = "soundboard_played")]
    SoundboardPlayed {
        channel_id: String,
        clip_id: String,
        clip_name: String,
        public_key: String,
    },
    /// Echo of our own `ping`. The nonce is the millisecond we sent it, so
    /// the round trip needs no table of outstanding probes. `outbound_loss_pct`
    /// is the relay's own count of gaps in our packet counter — absent on a
    /// hub without `voice.loss` and while we are sending no voice, and both of
    /// those must read as "no number" rather than as zero.
    #[serde(rename = "pong")]
    Pong {
        nonce: Option<i64>,
        outbound_loss_pct: Option<f32>,
    },
    #[serde(other)]
    Other,
}

// ---------------------------------------------------------------------------
// Link preview
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public profile
// ---------------------------------------------------------------------------
