use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use crate::identity::Identity;
use x25519_dalek;

mod auth_creds;
mod devices;
mod home_hub;
mod identity;
mod pairing;
mod prefs_blob;

// --- Shared state ---

struct AppState {
    /// Live hub sessions keyed by hub_id (the hub's public_key).
    hubs: Mutex<HashMap<String, HubSession>>,
    /// Currently active hub_id (what the UI is showing).
    active_hub: Mutex<Option<String>>,
    /// Voice session (only one at a time across all hubs).
    voice: Mutex<Option<VoiceSession>>,
    http_client: reqwest::Client,
}

struct HubSession {
    hub_id: String,
    hub_name: String,
    hub_url: String,
    hub_icon: Option<String>,
    token: String,
    ws_tx: mpsc::UnboundedSender<WsCommand>,
    ws_task: JoinHandle<()>,
}

enum WsCommand {
    Subscribe(String),
    Unsubscribe(String),
    VoiceJoin { channel_id: String, udp_port: u16 },
    VoiceLeave { channel_id: String },
    VoiceSpeaking { channel_id: String, speaking: bool },
    Typing { channel_id: String, typing: bool },
    DmTyping { conversation_id: String, typing: bool },
    Raw(String),
}

struct PendingDeepLink {
    url: std::sync::Mutex<Option<String>>,
}

struct VoiceSession {
    channel_id: String,
    hub_id: String,
    stop_tx: std::sync::mpsc::Sender<()>,
    /// Self-mute / self-deafen flags shared with the audio pipeline. Setting
    /// either flips behavior in the running send/recv tasks without going
    /// through a control channel.
    muted: std::sync::Arc<std::sync::atomic::AtomicBool>,
    deafened: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
pub(crate) struct StoredVoiceSettings {
    input_device: Option<String>,
    output_device: Option<String>,
    /// Range [0.001, 0.2]. Higher = less sensitive.
    vad_threshold: Option<f32>,
    /// "vad" (default) or "ptt". In PTT mode the mic is muted at rest and
    /// only opens while the configured key is held down.
    #[serde(default)]
    voice_mode: Option<String>,
    /// KeyboardEvent.code of the PTT hotkey (e.g. "Space", "ControlLeft").
    /// Stored as a layout-independent code so it survives keyboard switches.
    #[serde(default)]
    ptt_key: Option<String>,
}

#[derive(Serialize)]
struct AudioDeviceList {
    inputs: Vec<String>,
    outputs: Vec<String>,
}

// --- DTOs ---

#[derive(Serialize, Deserialize, Clone)]
struct HubInfo {
    hub_id: String,
    hub_name: String,
    hub_url: String,
    hub_icon: Option<String>,
    is_active: bool,
}

#[derive(Serialize, Deserialize, Clone)]
struct SavedHub {
    hub_id: String,
    hub_name: String,
    hub_url: String,
}

#[derive(Serialize, Deserialize)]
struct InfoResponse {
    name: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    icon: Option<String>,
    public_key: String,
    #[serde(default)]
    farm_url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct RoleInfo {
    id: String,
    name: String,
    permissions: Vec<String>,
    priority: i64,
    #[serde(default)]
    display_separately: bool,
}

#[derive(Serialize, Deserialize, Clone)]
struct MeInfo {
    public_key: String,
    display_name: Option<String>,
    #[serde(default)]
    avatar: Option<String>,
    /// Either "approved" or "pending". The hub server defaults missing
    /// rows to "approved", so for unmoderated hubs this is just always
    /// "approved".
    #[serde(default = "default_approval_status")]
    approval_status: String,
    roles: Vec<RoleInfo>,
}

fn default_approval_status() -> String {
    "approved".to_string()
}

#[derive(Serialize, Deserialize, Clone)]
struct HubBranding {
    name: String,
    description: Option<String>,
    icon: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct HubSettings {
    require_approval: bool,
    invite_only: bool,
    min_security_level: u32,
    max_channel_depth: u32,
}

#[derive(Serialize, Deserialize, Clone)]
struct PendingUser {
    public_key: String,
    display_name: Option<String>,
    first_seen_at: i64,
}


#[derive(Serialize, Deserialize, Clone)]
struct ChannelInfo {
    id: String,
    name: String,
    created_by: String,
    parent_id: Option<String>,
    is_category: bool,
    channel_type: String,
    display_order: i64,
    description: Option<String>,
    icon: Option<String>,
    color: Option<String>,
    custom_icon_svg: Option<String>,
    created_at: i64,
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
struct UserInfo {
    public_key: String,
    display_name: Option<String>,
    #[serde(default)]
    avatar: Option<String>,
    online: bool,
    #[serde(default)]
    group_role: Option<String>,
    #[serde(default)]
    is_bot: bool,
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
struct FriendInfo {
    public_key: String,
    display_name: Option<String>,
    since: i64,
}

#[derive(Serialize, Deserialize, Clone)]
struct ConversationInfo {
    id: String,
    conv_type: String,
    members: Vec<String>,
    created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
struct DmMessageInfo {
    id: String,
    conversation_id: String,
    sender: String,
    sender_name: Option<String>,
    content: String,
    created_at: i64,
    #[serde(default)]
    attachments: Vec<AttachmentInfo>,
    #[serde(default)]
    is_encrypted: bool,
    #[serde(default)]
    delivery_failed: bool,
}

/// Raw response from the hub for a DM message — may include an encrypted envelope.
/// Converted to `DmMessageInfo` after optional in-process decryption.
#[derive(Deserialize)]
struct RawDmMessageResponse {
    id: String,
    conversation_id: String,
    sender: String,
    sender_name: Option<String>,
    content: Option<String>,
    created_at: i64,
    #[serde(default)]
    attachments: Vec<AttachmentInfo>,
    #[serde(default)]
    is_encrypted: bool,
    #[serde(default)]
    delivery_failed: bool,
    encrypted_envelope: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone)]
struct AttachmentInfo {
    name: String,
    mime: String,
    data_b64: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct ReactionInfo {
    emoji: String,
    count: i64,
    me: bool,
}

#[derive(Serialize, Deserialize, Clone)]
struct ReplyContextInfo {
    message_id: String,
    sender: String,
    sender_name: Option<String>,
    content_preview: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct MessageInfo {
    id: String,
    channel_id: String,
    sender: String,
    sender_name: Option<String>,
    content: String,
    created_at: i64,
    #[serde(default)]
    edited_at: Option<i64>,
    #[serde(default)]
    attachments: Vec<AttachmentInfo>,
    #[serde(default)]
    reactions: Vec<ReactionInfo>,
    #[serde(default)]
    reply_to: Option<ReplyContextInfo>,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum WsServerMessage {
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
    #[serde(rename = "voice_joined")]
    VoiceJoined {
        channel_id: String,
        hub_udp_port: u16,
        participants: Vec<VoiceParticipantInfo>,
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
    Error {
        context: String,
        message: String,
    },
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
    #[serde(other)]
    Other,
}

#[derive(Serialize, Deserialize, Clone)]
struct VoiceParticipantInfo {
    public_key: String,
    display_name: Option<String>,
}

// --- Persistence: saved hubs file ---

fn saved_hubs_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".voxply").join("hubs.json"))
}

fn active_hub_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".voxply").join("active_hub"))
}

fn voice_settings_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".voxply").join("voice.json"))
}

fn unread_state_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".voxply").join("unread.json"))
}

fn notification_mutes_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".voxply").join("notification_mutes.json"))
}

fn pinned_channels_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".voxply").join("pinned_channels.json"))
}

fn collapsed_categories_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".voxply").join("collapsed_categories.json"))
}

fn blocked_users_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".voxply").join("blocked_users.json"))
}

#[tauri::command]
fn load_blocked_users() -> Result<Vec<String>, String> {
    let path = blocked_users_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = std::fs::read_to_string(&path).map_err(|e| format!("read: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("parse: {e}"))
}

pub(crate) fn save_blocked_users_raw(users: &[String]) -> Result<(), String> {
    let path = blocked_users_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let text = serde_json::to_string(users).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

#[tauri::command]
fn save_blocked_users(blocked: Vec<String>) -> Result<(), String> {
    let path = blocked_users_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let text = serde_json::to_string(&blocked).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

#[tauri::command]
fn load_collapsed_categories() -> Result<serde_json::Value, String> {
    let path = collapsed_categories_path()?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let text = std::fs::read_to_string(&path).map_err(|e| format!("read: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("parse: {e}"))
}

#[tauri::command]
fn save_collapsed_categories(state: serde_json::Value) -> Result<(), String> {
    let path = collapsed_categories_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let text = serde_json::to_string(&state).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

#[tauri::command]
fn load_pinned_channels() -> Result<serde_json::Value, String> {
    let path = pinned_channels_path()?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let text = std::fs::read_to_string(&path).map_err(|e| format!("read: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("parse: {e}"))
}

#[tauri::command]
fn save_pinned_channels(state: serde_json::Value) -> Result<(), String> {
    let path = pinned_channels_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let text = serde_json::to_string(&state).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

#[tauri::command]
fn load_notification_mutes() -> Result<serde_json::Value, String> {
    let path = notification_mutes_path()?;
    if !path.exists() {
        return Ok(serde_json::json!({ "hubs": {}, "channels": {} }));
    }
    let text = std::fs::read_to_string(&path).map_err(|e| format!("read: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("parse: {e}"))
}

#[tauri::command]
fn save_notification_mutes(state: serde_json::Value) -> Result<(), String> {
    let path = notification_mutes_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let text = serde_json::to_string(&state).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

#[tauri::command]
fn load_unread_state() -> Result<serde_json::Value, String> {
    let path = unread_state_path()?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let text = std::fs::read_to_string(&path).map_err(|e| format!("read: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("parse: {e}"))
}

#[tauri::command]
fn save_unread_state(state: serde_json::Value) -> Result<(), String> {
    let path = unread_state_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let text = serde_json::to_string(&state).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

fn profile_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".voxply").join("profile.json"))
}

#[derive(Serialize, Deserialize, Clone)]
struct NamedProfile {
    /// Stable identifier (UUID generated on the client when the profile is
    /// created).
    id: String,
    /// User-given label for this profile, e.g. "Work" or "Gaming".
    label: String,
    /// Display name applied when this profile is used.
    #[serde(default)]
    display_name: String,
    /// Optional avatar (base64 data URL).
    #[serde(default)]
    avatar: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct LocalProfile {
    /// All profiles the user has defined. Empty on fresh installs.
    #[serde(default)]
    profiles: Vec<NamedProfile>,
    /// Which profile to auto-apply on new hubs. Falls back to the first
    /// profile in the list when missing or stale.
    #[serde(default)]
    default_profile_id: Option<String>,

    /// Visual theme preference: "calm" | "classic" | "linear" | "light".
    /// Missing or unknown values fall back to calm at the client.
    #[serde(default)]
    theme: Option<String>,
}

impl LocalProfile {
    fn default_profile(&self) -> Option<&NamedProfile> {
        if self.profiles.is_empty() {
            return None;
        }
        if let Some(id) = self.default_profile_id.as_ref() {
            if let Some(p) = self.profiles.iter().find(|p| &p.id == id) {
                return Some(p);
            }
        }
        self.profiles.first()
    }
}

fn load_profile() -> LocalProfile {
    if let Ok(path) = profile_path() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(p) = serde_json::from_str::<LocalProfile>(&data) {
                return p;
            }
        }
    }
    LocalProfile::default()
}

fn save_profile_to_disk(profile: &LocalProfile) -> Result<(), String> {
    let path = profile_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Mkdir failed: {e}"))?;
    }
    let json = serde_json::to_string_pretty(profile).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Write failed: {e}"))?;
    Ok(())
}

#[tauri::command]
fn get_profile() -> LocalProfile {
    load_profile()
}

#[tauri::command]
fn save_profile(profile: LocalProfile) -> Result<(), String> {
    save_profile_to_disk(&profile)
}

fn load_voice_settings() -> StoredVoiceSettings {
    if let Ok(path) = voice_settings_path() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(s) = serde_json::from_str::<StoredVoiceSettings>(&data) {
                return s;
            }
        }
    }
    StoredVoiceSettings::default()
}

fn save_voice_settings_to_disk(settings: &StoredVoiceSettings) -> Result<(), String> {
    let path = voice_settings_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Mkdir failed: {e}"))?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Write failed: {e}"))?;
    Ok(())
}

fn load_saved_hubs() -> Vec<SavedHub> {
    if let Ok(path) = saved_hubs_path() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(hubs) = serde_json::from_str(&data) {
                return hubs;
            }
        }
    }
    Vec::new()
}

fn save_hubs_list(hubs: &[SavedHub]) -> Result<(), String> {
    let path = saved_hubs_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Mkdir failed: {e}"))?;
    }
    let json = serde_json::to_string_pretty(hubs).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Write failed: {e}"))?;
    Ok(())
}

fn load_active_hub_id() -> Option<String> {
    let path = active_hub_path().ok()?;
    let data = std::fs::read_to_string(&path).ok()?;
    let trimmed = data.trim();
    if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
}

fn save_active_hub_id(hub_id: Option<&str>) {
    let Ok(path) = active_hub_path() else { return };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, hub_id.unwrap_or(""));
}

// --- Helpers ---

/// Get the active session details (hub_url, token) or error if no hub selected.
fn active_session(state: &AppState) -> Result<(String, String), String> {
    let active_id = state
        .active_hub
        .lock()
        .unwrap()
        .clone()
        .ok_or("No active hub")?;
    let hubs = state.hubs.lock().unwrap();
    let s = hubs.get(&active_id).ok_or("Active hub not connected")?;
    Ok((s.hub_url.clone(), s.token.clone()))
}

/// Look up a session by hub_url (for commands that receive an explicit hub_url parameter).
fn session_for_url(state: &AppState, hub_url: &str) -> Result<String, String> {
    let normalized = hub_url.trim_end_matches('/').to_string();
    let hubs = state.hubs.lock().unwrap();
    hubs.values()
        .find(|s| s.hub_url.trim_end_matches('/') == normalized)
        .map(|s| s.token.clone())
        .ok_or_else(|| format!("No active session for hub: {hub_url}"))
}

#[tauri::command]
async fn get_hub_ws_info(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let (hub_url, token) = active_session(&state)?;
    Ok(serde_json::json!({ "hub_url": hub_url, "token": token }))
}

/// Get the active session's WS sender.
fn active_ws_tx(state: &AppState) -> Result<mpsc::UnboundedSender<WsCommand>, String> {
    let active_id = state
        .active_hub
        .lock()
        .unwrap()
        .clone()
        .ok_or("No active hub")?;
    let hubs = state.hubs.lock().unwrap();
    let s = hubs.get(&active_id).ok_or("Active hub not connected")?;
    Ok(s.ws_tx.clone())
}

// --- Tauri commands ---

/// Connect to a hub by URL. Adds it to the saved list.
#[tauri::command]
async fn add_hub(
    hub_url: String,
    invite_code: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<HubInfo, String> {
    let creds = auth_creds::load_active_credentials()?;

    let client = state.http_client.clone();

    // Get hub info first (gives us hub_id and name)
    let info: InfoResponse = client
        .get(format!("{hub_url}/info"))
        .send()
        .await
        .map_err(|e| format!("Failed to reach hub: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid info response: {e}"))?;

    let hub_id = info.public_key.clone();
    let hub_name = info.name.clone();
    let hub_icon = info.icon.clone();
    let auth_url = info.farm_url.as_deref().unwrap_or(&hub_url).to_string();

    // Authenticate — paired-device clients include the master cert,
    // legacy clients use the single-key flow unchanged.
    let token = creds.authenticate(&auth_url, &client, invite_code.as_deref()).await?;

    // Auto-apply the user's default profile to this hub whenever the hub
    // doesn't already have a value for the field. Lets a new hub inherit
    // your identity instead of showing your pubkey.
    let profile = load_profile();
    if let Some(default_profile) = profile.default_profile().cloned() {
        if let Ok(me_resp) = client
            .get(format!("{hub_url}/me"))
            .bearer_auth(&token)
            .send()
            .await
        {
            if let Ok(me) = me_resp.json::<serde_json::Value>().await {
                let mut patch = serde_json::Map::new();
                let has_name = me
                    .get("display_name")
                    .and_then(|v| v.as_str())
                    .map(|s| !s.is_empty())
                    .unwrap_or(false);
                if !has_name && !default_profile.display_name.trim().is_empty() {
                    patch.insert(
                        "display_name".to_string(),
                        serde_json::Value::String(default_profile.display_name.clone()),
                    );
                }
                let has_avatar = me
                    .get("avatar")
                    .and_then(|v| v.as_str())
                    .map(|s| !s.is_empty())
                    .unwrap_or(false);
                if !has_avatar {
                    if let Some(a) = default_profile.avatar.as_deref() {
                        if !a.is_empty() {
                            patch.insert(
                                "avatar".to_string(),
                                serde_json::Value::String(a.to_string()),
                            );
                        }
                    }
                }
                if !patch.is_empty() {
                    let _ = client
                        .patch(format!("{hub_url}/me"))
                        .bearer_auth(&token)
                        .json(&serde_json::Value::Object(patch))
                        .send()
                        .await;
                }
            }
        }
    }

    // Spawn WS task with hub_id tagging
    let (cmd_tx, ws_task) = spawn_ws_task(hub_id.clone(), hub_url.clone(), token.clone(), app.clone()).await?;

    let session = HubSession {
        hub_id: hub_id.clone(),
        hub_name: hub_name.clone(),
        hub_url: hub_url.clone(),
        hub_icon: hub_icon.clone(),
        token,
        ws_tx: cmd_tx,
        ws_task,
    };

    {
        let mut hubs = state.hubs.lock().unwrap();
        hubs.insert(hub_id.clone(), session);
    }

    // Auto-set as active if no active hub yet
    {
        let mut active = state.active_hub.lock().unwrap();
        if active.is_none() {
            *active = Some(hub_id.clone());
        }
    }

    // Persist to disk
    let mut saved = load_saved_hubs();
    if !saved.iter().any(|h| h.hub_id == hub_id) {
        saved.push(SavedHub {
            hub_id: hub_id.clone(),
            hub_name: hub_name.clone(),
            hub_url: hub_url.clone(),
        });
        let _ = save_hubs_list(&saved);
    }

    let active = state.active_hub.lock().unwrap().clone();
    Ok(HubInfo {
        hub_id: hub_id.clone(),
        hub_name,
        hub_url,
        hub_icon,
        is_active: active.as_deref() == Some(hub_id.as_str()),
    })
}

#[tauri::command]
async fn ping_hub(hub_id: String, state: State<'_, AppState>) -> Result<u64, String> {
    let hub_url = {
        let hubs = state.hubs.lock().unwrap();
        hubs.get(&hub_id).map(|s| s.hub_url.clone())
    }
    .ok_or("Hub not connected")?;

    let client = state.http_client.clone();
    let start = std::time::Instant::now();
    let resp = client
        .get(format!("{hub_url}/health"))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    Ok(start.elapsed().as_millis() as u64)
}

#[tauri::command]
fn list_hubs(state: State<'_, AppState>) -> Vec<HubInfo> {
    let hubs = state.hubs.lock().unwrap();
    let active = state.active_hub.lock().unwrap().clone();
    hubs.values()
        .map(|s| HubInfo {
            hub_id: s.hub_id.clone(),
            hub_name: s.hub_name.clone(),
            hub_url: s.hub_url.clone(),
            hub_icon: s.hub_icon.clone(),
            is_active: active.as_deref() == Some(s.hub_id.as_str()),
        })
        .collect()
}

#[tauri::command]
fn set_active_hub(hub_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let hubs = state.hubs.lock().unwrap();
    if !hubs.contains_key(&hub_id) {
        return Err("Hub not connected".to_string());
    }
    *state.active_hub.lock().unwrap() = Some(hub_id.clone());
    save_active_hub_id(Some(&hub_id));
    Ok(())
}

#[tauri::command]
fn remove_hub(hub_id: String, state: State<'_, AppState>) -> Result<(), String> {
    if let Some(session) = state.hubs.lock().unwrap().remove(&hub_id) {
        session.ws_task.abort();
    }
    {
        let mut active = state.active_hub.lock().unwrap();
        if active.as_deref() == Some(hub_id.as_str()) {
            *active = None;
            save_active_hub_id(None);
        }
    }
    let mut saved = load_saved_hubs();
    saved.retain(|h| h.hub_id != hub_id);
    let _ = save_hubs_list(&saved);
    Ok(())
}

#[tauri::command]
async fn auto_connect_saved(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<HubInfo>, String> {
    let saved = load_saved_hubs();
    for hub in &saved {
        let _ = add_hub(hub.hub_url.clone(), None, state.clone(), app.clone()).await;
    }

    // Restore the previously-active hub if it successfully reconnected.
    if let Some(persisted) = load_active_hub_id() {
        let hubs = state.hubs.lock().unwrap();
        if hubs.contains_key(&persisted) {
            drop(hubs);
            *state.active_hub.lock().unwrap() = Some(persisted);
        }
    }

    Ok(list_hubs(state))
}

async fn spawn_ws_task(
    hub_id: String,
    hub_url: String,
    token: String,
    app: AppHandle,
) -> Result<(mpsc::UnboundedSender<WsCommand>, JoinHandle<()>), String> {
    let ws_url = hub_url
        .replace("http://", "ws://")
        .replace("https://", "wss://");
    let url = format!("{ws_url}/ws?token={token}");

    let (ws_stream, _) = tokio_tungstenite::connect_async(&url)
        .await
        .map_err(|e| format!("WebSocket connect failed: {e}"))?;

    let (mut ws_tx, mut ws_rx) = ws_stream.split();
    let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<WsCommand>();
    let hub_id_for_task = hub_id.clone();

    // Tell the frontend this hub's WS is live now.
    let _ = app.emit(
        "hub-ws-status",
        serde_json::json!({ "hub_id": hub_id_for_task, "connected": true }),
    );

    let status_app = app.clone();
    let status_hub_id = hub_id_for_task.clone();
    let task = tokio::spawn(async move {
        loop {
            tokio::select! {
                maybe_msg = ws_rx.next() => {
                    match maybe_msg {
                        Some(Ok(WsMessage::Text(text))) => {
                            if let Ok(server_msg) = serde_json::from_str::<WsServerMessage>(&text) {
                                match server_msg {
                                    WsServerMessage::ChatMessage { channel_id, message } => {
                                        let _ = app.emit("chat-message", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "message": message,
                                        }));
                                    }
                                    WsServerMessage::MessageEdited { channel_id, message } => {
                                        let _ = app.emit("chat-message-edited", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "message": message,
                                        }));
                                    }
                                    WsServerMessage::MessageDeleted { channel_id, message_id } => {
                                        let _ = app.emit("chat-message-deleted", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "message_id": message_id,
                                        }));
                                    }
                                    WsServerMessage::ReactionsUpdated { channel_id, message_id, reactions } => {
                                        let _ = app.emit("chat-reactions-updated", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "message_id": message_id,
                                            "reactions": reactions,
                                        }));
                                    }
                                    WsServerMessage::Typing { channel_id, public_key, display_name, typing } => {
                                        let _ = app.emit("chat-typing", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "public_key": public_key,
                                            "display_name": display_name,
                                            "typing": typing,
                                        }));
                                    }
                                    WsServerMessage::VoiceJoined { channel_id, hub_udp_port, participants } => {
                                        let _ = app.emit("voice-joined", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "hub_udp_port": hub_udp_port,
                                            "participants": participants,
                                        }));
                                    }
                                    WsServerMessage::VoiceParticipantJoined { channel_id, participant } => {
                                        let _ = app.emit("voice-participant-joined", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "participant": participant,
                                        }));
                                    }
                                    WsServerMessage::VoiceParticipantLeft { channel_id, public_key } => {
                                        let _ = app.emit("voice-participant-left", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "public_key": public_key,
                                        }));
                                    }
                                    WsServerMessage::VoiceParticipantSpeaking { channel_id, public_key, speaking } => {
                                        let _ = app.emit("voice-participant-speaking", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "channel_id": channel_id,
                                            "public_key": public_key,
                                            "speaking": speaking,
                                        }));
                                    }
                                    WsServerMessage::Error { context, message } => {
                                        let _ = app.emit("hub-error", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "context": context,
                                            "message": message,
                                        }));
                                    }
                                    WsServerMessage::DirectMessage { conversation_id, sender, sender_name, content, timestamp } => {
                                        let _ = app.emit("dm", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "conversation_id": conversation_id,
                                            "sender": sender,
                                            "sender_name": sender_name,
                                            "content": content,
                                            "timestamp": timestamp,
                                        }));
                                    }
                                    WsServerMessage::DmTyping { conversation_id, sender, sender_name, typing } => {
                                        let _ = app.emit("dm-typing", serde_json::json!({
                                            "hub_id": hub_id_for_task,
                                            "conversation_id": conversation_id,
                                            "sender": sender,
                                            "sender_name": sender_name,
                                            "typing": typing,
                                        }));
                                    }
                                    WsServerMessage::Other => {}
                                }
                            }
                        }
                        Some(Ok(WsMessage::Close(_))) | None => break,
                        Some(Err(e)) => {
                            eprintln!("WS recv error: {e}");
                            break;
                        }
                        _ => {}
                    }
                }
                Some(cmd) = cmd_rx.recv() => {
                    let json = match cmd {
                        WsCommand::Subscribe(channel_id) => {
                            serde_json::json!({ "type": "subscribe", "channel_id": channel_id })
                        }
                        WsCommand::Unsubscribe(channel_id) => {
                            serde_json::json!({ "type": "unsubscribe", "channel_id": channel_id })
                        }
                        WsCommand::VoiceJoin { channel_id, udp_port } => {
                            serde_json::json!({ "type": "voice_join", "channel_id": channel_id, "udp_port": udp_port })
                        }
                        WsCommand::VoiceLeave { channel_id } => {
                            serde_json::json!({ "type": "voice_leave", "channel_id": channel_id })
                        }
                        WsCommand::VoiceSpeaking { channel_id, speaking } => {
                            serde_json::json!({
                                "type": "voice_speaking",
                                "channel_id": channel_id,
                                "speaking": speaking,
                            })
                        }
                        WsCommand::Typing { channel_id, typing } => {
                            serde_json::json!({
                                "type": "typing",
                                "channel_id": channel_id,
                                "typing": typing,
                            })
                        }
                        WsCommand::DmTyping { conversation_id, typing } => {
                            serde_json::json!({
                                "type": "dm_typing",
                                "conversation_id": conversation_id,
                                "typing": typing,
                            })
                        }
                        WsCommand::Raw(raw_json) => {
                            if ws_tx.send(WsMessage::Text(raw_json.into())).await.is_err() {
                                break;
                            }
                            continue;
                        }
                    };
                    if ws_tx.send(WsMessage::Text(json.to_string().into())).await.is_err() {
                        break;
                    }
                }
            }
        }
        // Loop exited -- WS is closed. Tell the frontend so it can show
        // a "Reconnecting…" banner. The user can trigger reconnect_hub
        // to try again.
        let _ = status_app.emit(
            "hub-ws-status",
            serde_json::json!({ "hub_id": status_hub_id, "connected": false }),
        );
    });

    Ok((cmd_tx, task))
}

#[tauri::command]
async fn list_channels(state: State<'_, AppState>) -> Result<Vec<ChannelInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    client
        .get(format!("{hub_url}/channels"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))
}

#[derive(Serialize, Deserialize, Clone)]
struct InstalledGame {
    id: String,
    name: String,
    entry_url: String,
    description: Option<String>,
    thumbnail_url: Option<String>,
}

#[tauri::command]
async fn list_games(state: State<'_, AppState>) -> Result<Vec<InstalledGame>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    client
        .get(format!("{hub_url}/hub/games"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn create_channel(
    name: String,
    parent_id: Option<String>,
    is_category: bool,
    description: Option<String>,
    channel_type: Option<String>,
    state: State<'_, AppState>,
) -> Result<ChannelInfo, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/channels"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "name": name,
            "parent_id": parent_id,
            "is_category": is_category,
            "description": description,
            "channel_type": channel_type,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn update_channel_description(
    channel_id: String,
    description: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .patch(format!("{hub_url}/channels/{channel_id}"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "description": description }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn rename_channel(
    channel_id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .patch(format!("{hub_url}/channels/{channel_id}"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "name": name }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn move_channel(
    channel_id: String,
    parent_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    // Body always contains the parent_id key so the server treats it as a real
    // change (Option<Option<String>> tri-state).
    let body = serde_json::json!({ "parent_id": parent_id });
    let resp = client
        .patch(format!("{hub_url}/channels/{channel_id}"))
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn update_channel_appearance(
    channel_id: String,
    icon: Option<String>,
    color: Option<String>,
    custom_icon_svg: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let body = serde_json::json!({ "icon": icon, "color": color, "custom_icon_svg": custom_icon_svg });
    let resp = client
        .patch(format!("{hub_url}/channels/{channel_id}"))
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn reorder_channels(
    channel_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/channels/reorder"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "channel_ids": channel_ids }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn delete_channel(channel_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!("{hub_url}/channels/{channel_id}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn list_users(state: State<'_, AppState>, app: AppHandle) -> Result<Vec<UserInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/users"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;

    // On 401 the session token is stale (hub restarted, kicked, etc). Try to
    // re-authenticate transparently. Only if re-auth itself fails do we treat
    // this as a terminal session loss and notify the UI.
    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        let active_id = state.active_hub.lock().unwrap().clone();
        if let Some(hub_id) = active_id {
            match reauth_session(&state, &app, &hub_id).await {
                Ok(new_token) => {
                    let retry = client
                        .get(format!("{hub_url}/users"))
                        .bearer_auth(&new_token)
                        .send()
                        .await
                        .map_err(|e| format!("Failed: {e}"))?;
                    return retry.json().await.map_err(|e| format!("Invalid: {e}"))
                }
                Err(e) => {
                    // Auth refused — likely banned, or the hub identity changed.
                    let hubs = state.hubs.lock().unwrap();
                    if let Some(session) = hubs.get(&hub_id) {
                        let _ = app.emit(
                            "hub-session-lost",
                            serde_json::json!({
                                "hub_id": session.hub_id,
                                "hub_name": session.hub_name,
                            }),
                        );
                    }
                    return Err(format!("Session lost: {e}"));
                }
            }
        }
        return Err("Session lost".to_string());
    }

    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

/// Re-authenticate the identity against the hub_id's url and, on success,
/// swap in the fresh session token + restart the WS subscription so real-time
/// events keep flowing. Returns the new token.
async fn reauth_session(
    state: &State<'_, AppState>,
    app: &AppHandle,
    hub_id: &str,
) -> Result<String, String> {
    let hub_url = {
        let hubs = state.hubs.lock().unwrap();
        let s = hubs.get(hub_id).ok_or("Hub not connected")?;
        s.hub_url.clone()
    };

    let creds = auth_creds::load_active_credentials()?;
    let client = state.http_client.clone();
    let info: InfoResponse = client
        .get(format!("{hub_url}/info"))
        .send()
        .await
        .map_err(|e| format!("reauth info fetch: {e}"))?
        .json()
        .await
        .map_err(|e| format!("reauth info decode: {e}"))?;
    let auth_url = info.farm_url.as_deref().unwrap_or(&hub_url).to_string();
    let new_token = creds.authenticate(&auth_url, &client, None).await?;

    // Restart the WS task with the new token. Abort the stale one first.
    let (old_task, hub_id_clone) = {
        let mut hubs = state.hubs.lock().unwrap();
        let session = hubs.get_mut(hub_id).ok_or("Hub vanished mid-reauth")?;
        session.token = new_token.clone();
        let old_task =
            std::mem::replace(&mut session.ws_task, tokio::spawn(async {}));
        (old_task, session.hub_id.clone())
    };
    old_task.abort();

    let (new_cmd_tx, new_task) =
        spawn_ws_task(hub_id_clone.clone(), hub_url, new_token.clone(), app.clone())
            .await
            .map_err(|e| format!("ws reconnect: {e}"))?;

    {
        let mut hubs = state.hubs.lock().unwrap();
        if let Some(session) = hubs.get_mut(hub_id) {
            session.ws_tx = new_cmd_tx;
            session.ws_task = new_task;
        }
    }

    println!("Re-authenticated with hub {}", &hub_id_clone[..16]);
    Ok(new_token)
}

#[tauri::command]
async fn get_messages(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<MessageInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let mut messages: Vec<MessageInfo> = client
        .get(format!("{hub_url}/channels/{channel_id}/messages"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))?;

    messages.reverse();
    Ok(messages)
}

#[tauri::command]
async fn add_reaction(
    channel_id: String,
    message_id: String,
    emoji: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!(
            "{hub_url}/channels/{channel_id}/messages/{message_id}/reactions"
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "emoji": emoji }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn remove_reaction(
    channel_id: String,
    message_id: String,
    emoji: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    // URL-encoding emoji is important since some are multi-byte and can
    // include reserved chars (variation selectors, etc.).
    let encoded = urlencoding_emoji(&emoji);
    let resp = client
        .delete(format!(
            "{hub_url}/channels/{channel_id}/messages/{message_id}/reactions/{encoded}"
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

/// Minimal percent-encoder for emoji path segments. We can't add a new
/// crate dep just for this; this hand-rolled version covers the chars
/// that appear in real emoji strings.
fn urlencoding_emoji(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push('%');
                out.push_str(&format!("{:02X}", b));
            }
        }
    }
    out
}

#[tauri::command]
async fn voice_populations(
    state: State<'_, AppState>,
) -> Result<std::collections::HashMap<String, u32>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/voice/populations"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

/// Returns voice participants grouped by channel id, with display_name
/// populated from the local users table on the hub. Lets the sidebar render
/// participant names nested under each voice-active channel rather than just
/// a count. Reuses the existing VoiceParticipantInfo struct.
#[tauri::command]
async fn voice_channel_participants(
    state: State<'_, AppState>,
) -> Result<std::collections::HashMap<String, Vec<VoiceParticipantInfo>>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/voice/participants"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn voice_active_users(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/voice/active-users"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn search_messages(
    channel_id: String,
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<MessageInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    // Server returns newest-first; we keep that order for the results panel
    // since users scanning search hits expect recent matches at the top.
    let messages: Vec<MessageInfo> = client
        .get(format!("{hub_url}/channels/{channel_id}/messages"))
        .query(&[("q", query.as_str())])
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))?;
    Ok(messages)
}

#[tauri::command]
async fn send_message(
    channel_id: String,
    content: String,
    attachments: Option<Vec<AttachmentInfo>>,
    reply_to: Option<String>,
    state: State<'_, AppState>,
) -> Result<MessageInfo, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let body = serde_json::json!({
        "content": content,
        "attachments": attachments.unwrap_or_default(),
        "reply_to": reply_to,
    });
    let resp = client
        .post(format!("{hub_url}/channels/{channel_id}/messages"))
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn edit_message(
    channel_id: String,
    message_id: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<MessageInfo, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .patch(format!("{hub_url}/channels/{channel_id}/messages/{message_id}"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "content": content }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn delete_message(
    channel_id: String,
    message_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!("{hub_url}/channels/{channel_id}/messages/{message_id}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
fn subscribe_channel(channel_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let tx = active_ws_tx(&state)?;
    tx.send(WsCommand::Subscribe(channel_id))
        .map_err(|_| "WS closed".to_string())
}

#[tauri::command]
fn unsubscribe_channel(channel_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let tx = active_ws_tx(&state)?;
    tx.send(WsCommand::Unsubscribe(channel_id))
        .map_err(|_| "WS closed".to_string())
}

/// User-triggered re-auth + WS restart for a specific hub. Useful when the
/// connection silently dropped and the "Reconnecting…" banner is showing.
#[tauri::command]
async fn reconnect_hub(
    hub_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    reauth_session(&state, &app, &hub_id).await?;
    Ok(())
}

/// Wipe local-only state files (unread, notification mutes, pinned channels,
/// collapsed categories, voice settings). Identity and saved-hubs are NOT
/// touched -- those are user-meaningful and need an explicit recover/leave
/// flow.
#[tauri::command]
fn clear_local_data() -> Result<(), String> {
    let paths = [
        unread_state_path()?,
        notification_mutes_path()?,
        pinned_channels_path()?,
        collapsed_categories_path()?,
        blocked_users_path()?,
        voice_settings_path()?,
    ];
    for p in paths {
        if p.exists() {
            // Best-effort: if any single file fails to delete (file in use,
            // permissions), keep going so we delete what we can.
            let _ = std::fs::remove_file(&p);
        }
    }
    Ok(())
}

/// Fetch /info from any hub URL without an active session. Used by the
/// add-hub dialog to preview a hub's name + icon + description before
/// committing. Trims trailing slash so users can paste either form.
#[tauri::command]
async fn preview_hub_info(url: String) -> Result<InfoResponse, String> {
    let base = url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("Empty URL".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| format!("client: {e}"))?;
    let resp = client
        .get(format!("{base}/info"))
        .send()
        .await
        .map_err(|e| format!("Cannot reach hub: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Hub returned {}", resp.status()));
    }
    resp.json().await.map_err(|e| format!("Invalid /info: {e}"))
}

/// Returns the `voxply://` URL that launched the app (if any) and clears it.
/// The frontend calls this on mount to detect deep-link launches.
#[tauri::command]
fn get_pending_deep_link(state: State<'_, PendingDeepLink>) -> Option<String> {
    state.url.lock().unwrap().take()
}

/// Persist a new hub ordering. The provided list should be the desired
/// order of hub_ids; any saved hub not in the list keeps its relative
/// position at the end (defensive against partial drags).
#[tauri::command]
fn reorder_hubs(hub_ids: Vec<String>) -> Result<(), String> {
    let saved = load_saved_hubs();
    let by_id: std::collections::HashMap<String, SavedHub> =
        saved.iter().map(|h| (h.hub_id.clone(), h.clone())).collect();

    let mut next: Vec<SavedHub> = Vec::with_capacity(saved.len());
    let mut seen = std::collections::HashSet::new();
    for id in &hub_ids {
        if let Some(h) = by_id.get(id) {
            next.push(h.clone());
            seen.insert(id.clone());
        }
    }
    // Append anything the caller didn't mention so we never silently lose
    // a hub from the saved list.
    for h in &saved {
        if !seen.contains(&h.hub_id) {
            next.push(h.clone());
        }
    }
    save_hubs_list(&next)
}

#[tauri::command]
fn set_typing(
    channel_id: String,
    typing: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let tx = active_ws_tx(&state)?;
    // Best-effort: if the WS is closed, the user just doesn't broadcast a
    // typing event -- not worth surfacing to the UI.
    let _ = tx.send(WsCommand::Typing { channel_id, typing });
    Ok(())
}

#[tauri::command]
fn set_dm_typing(
    conversation_id: String,
    typing: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let tx = active_ws_tx(&state)?;
    let _ = tx.send(WsCommand::DmTyping { conversation_id, typing });
    Ok(())
}

#[tauri::command]
async fn voice_join(
    channel_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if state.voice.lock().unwrap().is_some() {
        return Err("Already in a voice channel".to_string());
    }

    let (active_id, hub_url, ws_tx) = {
        let active_id = state
            .active_hub
            .lock()
            .unwrap()
            .clone()
            .ok_or("No active hub")?;
        let hubs = state.hubs.lock().unwrap();
        let s = hubs.get(&active_id).ok_or("Hub not connected")?;
        (active_id, s.hub_url.clone(), s.ws_tx.clone())
    };

    let host = hub_url
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .split('/')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("127.0.0.1")
        .to_string();

    // Resolve the hostname (works for both "localhost" and raw IPs).
    let hub_addr = tokio::net::lookup_host(format!("{host}:3001"))
        .await
        .map_err(|e| format!("Cannot resolve {host}: {e}"))?
        .next()
        .ok_or_else(|| format!("No addresses for {host}"))?;

    type VoiceReady = Result<
        (
            u16,
            std::sync::Arc<std::sync::atomic::AtomicBool>,
            std::sync::Arc<std::sync::atomic::AtomicBool>,
        ),
        String,
    >;
    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<VoiceReady>();
    let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();

    let speaking_ws = ws_tx.clone();
    let speaking_channel_id = channel_id.clone();
    let speaking_app = app.clone();

    std::thread::spawn(move || {
        let rt = match tokio::runtime::Runtime::new() {
            Ok(r) => r,
            Err(e) => {
                let _ = ready_tx.send(Err(format!("Runtime: {e}")));
                return;
            }
        };

        rt.block_on(async move {
            let saved = load_voice_settings();
            let vsettings = voxply_voice::VoiceSettings {
                input_device: saved.input_device,
                output_device: saved.output_device,
                vad_threshold: saved.vad_threshold,
            };
            let mut pipeline = match voxply_voice::AudioPipeline::start_p2p_with_settings(
                0, hub_addr, vsettings,
            )
            .await
            {
                Ok(p) => p,
                Err(e) => {
                    let _ = ready_tx.send(Err(format!("Audio: {e}")));
                    return;
                }
            };

            let local_port = pipeline.local_udp_port;
            let muted_arc = pipeline.muted.clone();
            let deafened_arc = pipeline.deafened.clone();
            let _ = ready_tx.send(Ok((local_port, muted_arc, deafened_arc)));

            // Forward speaking state from the VAD to the hub WS and emit a
            // local Tauri event so the current user's own chip can pulse too.
            let speaking_rx = pipeline.speaking_rx.take();
            let speaking_task = tokio::spawn(async move {
                let Some(mut rx) = speaking_rx else { return };
                while let Some(speaking) = rx.recv().await {
                    let _ = speaking_ws.send(WsCommand::VoiceSpeaking {
                        channel_id: speaking_channel_id.clone(),
                        speaking,
                    });
                    let _ = speaking_app.emit(
                        "voice-self-speaking",
                        serde_json::json!({ "speaking": speaking }),
                    );
                }
            });

            // Forward live mic RMS level so the UI can draw a level meter.
            let level_rx = pipeline.level_rx.take();
            let level_app = app.clone();
            let level_task = tokio::spawn(async move {
                let Some(mut rx) = level_rx else { return };
                while let Some(level) = rx.recv().await {
                    let _ = level_app.emit("mic-level", level);
                }
            });

            let _ = tokio::task::spawn_blocking(move || stop_rx.recv()).await;
            speaking_task.abort();
            level_task.abort();
            pipeline.stop().await;
        });
    });

    let (local_port, muted, deafened) = ready_rx
        .recv()
        .map_err(|_| "Voice thread died".to_string())??;

    ws_tx
        .send(WsCommand::VoiceJoin {
            channel_id: channel_id.clone(),
            udp_port: local_port,
        })
        .map_err(|_| "WS closed".to_string())?;

    *state.voice.lock().unwrap() = Some(VoiceSession {
        channel_id,
        hub_id: active_id,
        stop_tx,
        muted,
        deafened,
    });

    Ok(())
}

#[tauri::command]
fn voice_set_muted(muted: bool, state: State<'_, AppState>) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    if let Some(s) = state.voice.lock().unwrap().as_ref() {
        s.muted.store(muted, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
fn voice_set_deafened(deafened: bool, state: State<'_, AppState>) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    if let Some(s) = state.voice.lock().unwrap().as_ref() {
        // Deafen also mutes -- you can't talk over a one-way wall. Storing
        // both lets the user un-deafen back to whatever mute state they had.
        s.deafened.store(deafened, Ordering::Relaxed);
        if deafened {
            s.muted.store(true, Ordering::Relaxed);
        }
    }
    Ok(())
}

#[tauri::command]
fn voice_leave(state: State<'_, AppState>) -> Result<(), String> {
    let session = state.voice.lock().unwrap().take();
    if let Some(s) = session {
        let _ = s.stop_tx.send(());
        let hubs = state.hubs.lock().unwrap();
        if let Some(hub) = hubs.get(&s.hub_id) {
            let _ = hub.ws_tx.send(WsCommand::VoiceLeave {
                channel_id: s.channel_id,
            });
        }
    }
    Ok(())
}

#[tauri::command]
fn list_audio_devices() -> Result<AudioDeviceList, String> {
    let inputs = voxply_voice::devices::list_input_devices()
        .map_err(|e| format!("inputs: {e}"))?;
    let outputs = voxply_voice::devices::list_output_devices()
        .map_err(|e| format!("outputs: {e}"))?;
    Ok(AudioDeviceList { inputs, outputs })
}

#[tauri::command]
fn get_voice_settings() -> StoredVoiceSettings {
    load_voice_settings()
}

#[tauri::command]
fn save_voice_settings(settings: StoredVoiceSettings) -> Result<(), String> {
    save_voice_settings_to_disk(&settings)
}

#[tauri::command]
fn mic_test_start(state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    // Reuse the voice session slot so we don't collide with an in-progress call.
    if state.voice.lock().unwrap().is_some() {
        return Err("Leave the voice channel before testing the mic".to_string());
    }

    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();
    let level_app = app.clone();

    std::thread::spawn(move || {
        let rt = match tokio::runtime::Runtime::new() {
            Ok(r) => r,
            Err(e) => {
                let _ = ready_tx.send(Err(format!("Runtime: {e}")));
                return;
            }
        };
        rt.block_on(async move {
            let saved = load_voice_settings();
            let vsettings = voxply_voice::VoiceSettings {
                input_device: saved.input_device,
                output_device: saved.output_device,
                vad_threshold: saved.vad_threshold,
            };
            let mut pipeline =
                match voxply_voice::AudioPipeline::start_loopback_with_settings(vsettings).await {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = ready_tx.send(Err(format!("Audio: {e}")));
                        return;
                    }
                };
            let _ = ready_tx.send(Ok(()));

            let level_rx = pipeline.level_rx.take();
            let level_task = tokio::spawn(async move {
                let Some(mut rx) = level_rx else { return };
                while let Some(level) = rx.recv().await {
                    let _ = level_app.emit("mic-level", level);
                }
            });

            let _ = tokio::task::spawn_blocking(move || stop_rx.recv()).await;
            level_task.abort();
            pipeline.stop().await;
        });
    });

    ready_rx
        .recv()
        .map_err(|_| "Mic test thread died".to_string())??;

    // Stash the stop channel inside a dummy VoiceSession so mic_test_stop can close it.
    *state.voice.lock().unwrap() = Some(VoiceSession {
        channel_id: "__mic_test__".to_string(),
        hub_id: String::new(),
        stop_tx,
        muted: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        deafened: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    });

    Ok(())
}

#[tauri::command]
fn mic_test_stop(state: State<'_, AppState>) -> Result<(), String> {
    let session = state.voice.lock().unwrap().take();
    if let Some(s) = session {
        if s.channel_id == "__mic_test__" {
            let _ = s.stop_tx.send(());
            return Ok(());
        } else {
            // Put it back if it wasn't a mic test.
            *state.voice.lock().unwrap() = Some(s);
            return Err("No mic test in progress".to_string());
        }
    }
    Ok(())
}

#[tauri::command]
async fn update_display_name(display_name: String, state: State<'_, AppState>) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .patch(format!("{hub_url}/me"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "display_name": display_name }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn update_avatar(avatar: String, state: State<'_, AppState>) -> Result<(), String> {
    // Empty string clears the avatar on this hub.
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .patch(format!("{hub_url}/me"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "avatar": avatar }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
fn get_recovery_phrase() -> Result<String, String> {
    let path = Identity::default_path().map_err(|e| e.to_string())?;
    let identity = Identity::load(&path).map_err(|e| e.to_string())?;
    Ok(identity.recovery_phrase())
}

#[tauri::command]
fn recover_identity_from_phrase(
    phrase: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // Validate + reconstruct first so we can fail without touching anything.
    let restored = Identity::from_recovery_phrase(phrase.trim())
        .map_err(|e| format!("Invalid recovery phrase: {e}"))?;
    let new_pubkey = restored.public_key_hex();

    let identity_path = Identity::default_path().map_err(|e| e.to_string())?;

    // Tear down every live hub session — their tokens belong to the old
    // identity and won't authenticate anymore. We drain the map first, then
    // abort outside the lock so a slow shutdown doesn't hold it.
    let drained: Vec<_> = state
        .hubs
        .lock()
        .unwrap()
        .drain()
        .map(|(_, s)| s.ws_task)
        .collect();
    for task in drained {
        task.abort();
    }
    *state.active_hub.lock().unwrap() = None;
    save_active_hub_id(None);

    // Wipe the persisted hubs list — the user will re-add hubs under the
    // restored identity. Any hub that knew the old key as a member will
    // see the new key as a stranger.
    let _ = save_hubs_list(&[]);

    restored
        .save(&identity_path)
        .map_err(|e| format!("Failed to save identity: {e}"))?;

    Ok(new_pubkey)
}

#[tauri::command]
fn get_my_public_key() -> Result<String, String> {
    let path = Identity::default_path().map_err(|e| e.to_string())?;
    let (identity, _) = Identity::load_or_create(&path).map_err(|e| e.to_string())?;
    Ok(identity.public_key_hex())
}

fn load_master_identity() -> Result<crate::identity::MasterIdentity, String> {
    let path = Identity::default_path().map_err(|e| e.to_string())?;
    let identity = Identity::load(&path).map_err(|e| e.to_string())?;
    identity.master().map_err(|e| e.to_string())
}

#[tauri::command]
async fn push_prefs_blob() -> Result<(), String> {
    let master = load_master_identity()?;
    let blob_key = prefs_blob::derive_blob_key(&master);
    let home_hubs = crate::home_hub::read_cached_designation()
        .map(|d| d.hubs)
        .unwrap_or_default();
    if home_hubs.is_empty() {
        return Err("No home hubs configured".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    prefs_blob::push_prefs_blob(&master, &blob_key, &home_hubs, &client)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn pull_and_apply_prefs_blob() -> Result<prefs_blob::LocalPrefs, String> {
    let master = load_master_identity()?;
    let blob_key = prefs_blob::derive_blob_key(&master);
    let home_hubs = crate::home_hub::read_cached_designation()
        .map(|d| d.hubs)
        .unwrap_or_default();
    if home_hubs.is_empty() {
        return Err("No home hubs configured".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let prefs = prefs_blob::pull_prefs_blob(
        &master.public_key_hex(),
        &home_hubs,
        &blob_key,
        &client,
    )
    .await
    .map_err(|e| e.to_string())?;
    let _ = save_blocked_users_raw(&prefs.blocked_users);
    let _ = save_voice_settings_to_disk(&prefs.voice_settings);
    Ok(prefs)
}

#[derive(Serialize, Deserialize, Clone)]
struct BanInfo {
    target_public_key: String,
    banned_by: String,
    reason: Option<String>,
    created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
struct AllianceInfo {
    id: String,
    name: String,
    created_by: String,
    created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
struct AllianceMemberInfo {
    hub_public_key: String,
    hub_name: String,
    hub_url: String,
    joined_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
struct AllianceDetail {
    id: String,
    name: String,
    created_by: String,
    created_at: i64,
    members: Vec<AllianceMemberInfo>,
}

#[derive(Serialize, Deserialize, Clone)]
struct AllianceInvite {
    token: String,
    alliance_id: String,
    alliance_name: String,
    hub_url: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct AllianceSharedChannel {
    channel_id: String,
    channel_name: String,
    hub_public_key: String,
    hub_name: String,
}

#[tauri::command]
async fn list_alliances(state: State<'_, AppState>) -> Result<Vec<AllianceInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/alliances"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn create_alliance(
    name: String,
    state: State<'_, AppState>,
) -> Result<AllianceInfo, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/alliances"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "name": name }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn get_alliance(
    alliance_id: String,
    state: State<'_, AppState>,
) -> Result<AllianceDetail, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/alliances/{alliance_id}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn create_alliance_invite(
    alliance_id: String,
    state: State<'_, AppState>,
) -> Result<AllianceInvite, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/alliances/{alliance_id}/invite"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn join_alliance(
    inviter_hub_url: String,
    alliance_id: String,
    invite_token: String,
    own_hub_public_url: String,
    state: State<'_, AppState>,
) -> Result<AllianceDetail, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    // The join endpoint runs on OUR hub; our hub then talks to the inviter
    // and mirrors the alliance into our local DB so it shows up in our list.
    let resp = client
        .post(format!("{hub_url}/alliances/join"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "inviter_hub_url": inviter_hub_url,
            "alliance_id": alliance_id,
            "invite_token": invite_token,
            "own_hub_url": own_hub_public_url,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn leave_alliance(
    alliance_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!("{hub_url}/alliances/{alliance_id}/leave"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

/// Mirror of the hub's `PendingAllianceInviteRow`.
#[derive(Serialize, Deserialize, Clone)]
struct PendingAllianceInvite {
    id: String,
    alliance_id: String,
    alliance_name: String,
    from_hub_url: String,
    from_hub_name: String,
    from_hub_public_key: String,
    invite_token: String,
    created_at: i64,
    message: Option<String>,
}

/// Tell our own hub to push a direct invite to another hub.
#[tauri::command]
async fn send_alliance_push_invite(
    alliance_id: String,
    target_hub_url: String,
    own_hub_url: String,
    message: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/alliances/{alliance_id}/push-invite"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "target_hub_url": target_hub_url,
            "own_hub_url": own_hub_url,
            "message": message,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

/// List pending push invites received by our hub.
#[tauri::command]
async fn list_pending_alliance_invites(
    state: State<'_, AppState>,
) -> Result<Vec<PendingAllianceInvite>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/alliances/pending-invites"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

/// Accept or decline a pending push invite.
/// `own_hub_url` is required when accepting — the hub needs to pass it to the
/// inviter so the inviter can call back to verify identity.
#[tauri::command]
async fn respond_to_alliance_invite(
    invite_id: String,
    accept: bool,
    own_hub_url: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    if accept {
        let url_val = own_hub_url.unwrap_or_default();
        let resp = client
            .post(format!("{hub_url}/alliances/pending-invites/{invite_id}/accept"))
            .bearer_auth(&token)
            .json(&serde_json::json!({ "own_hub_url": url_val }))
            .send()
            .await
            .map_err(|e| format!("Failed: {e}"))?;
        if !resp.status().is_success() {
            return Err(resp.text().await.unwrap_or_default());
        }
    } else {
        let resp = client
            .delete(format!("{hub_url}/alliances/pending-invites/{invite_id}"))
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| format!("Failed: {e}"))?;
        if !resp.status().is_success() {
            return Err(resp.text().await.unwrap_or_default());
        }
    }
    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
struct ProxiedMessage {
    id: String,
    channel_id: String,
    sender: String,
    sender_name: Option<String>,
    content: String,
    created_at: i64,
    edited_at: Option<i64>,
    #[serde(default)]
    attachments: Vec<AttachmentInfo>,
}

#[tauri::command]
async fn get_alliance_channel_messages(
    alliance_id: String,
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<ProxiedMessage>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!(
            "{hub_url}/alliances/{alliance_id}/channels/{channel_id}/messages"
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn send_alliance_channel_message(
    alliance_id: String,
    channel_id: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!(
            "{hub_url}/alliances/{alliance_id}/channels/{channel_id}/messages"
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "content": content }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn list_alliance_shared_channels(
    alliance_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<AllianceSharedChannel>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/alliances/{alliance_id}/channels"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn share_channel_with_alliance(
    alliance_id: String,
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/alliances/{alliance_id}/channels"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "channel_id": channel_id }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn unshare_channel_from_alliance(
    alliance_id: String,
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!(
            "{hub_url}/alliances/{alliance_id}/channels/{channel_id}"
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
struct InviteInfo {
    code: String,
    created_by: String,
    max_uses: Option<i64>,
    uses: i64,
    expires_at: Option<i64>,
    created_at: i64,
}

#[tauri::command]
async fn list_invites(state: State<'_, AppState>) -> Result<Vec<InviteInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/invites"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn create_invite(
    max_uses: Option<i64>,
    expires_in_seconds: Option<i64>,
    state: State<'_, AppState>,
) -> Result<InviteInfo, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/invites"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "max_uses": max_uses,
            "expires_in_seconds": expires_in_seconds,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn revoke_invite(code: String, state: State<'_, AppState>) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!("{hub_url}/invites/{code}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn list_bans(state: State<'_, AppState>) -> Result<Vec<BanInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/moderation/bans"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn unban_user(
    target_public_key: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!("{hub_url}/moderation/bans/{target_public_key}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
struct MemberAdminInfo {
    public_key: String,
    display_name: Option<String>,
    online: bool,
    first_seen_at: i64,
    last_seen_at: i64,
    roles: Vec<RoleInfo>,
}

#[tauri::command]
async fn get_hub_settings(state: State<'_, AppState>) -> Result<HubSettings, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/hub/settings"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn list_pending_members(
    state: State<'_, AppState>,
) -> Result<Vec<PendingUser>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/hub/pending"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}


#[tauri::command]
async fn list_hub_icons(state: State<'_, AppState>) -> Result<Vec<HubIcon>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/hub/icons"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json::<Vec<HubIcon>>().await.map_err(|e| format!("Parse error: {e}"))
}

#[tauri::command]
async fn create_hub_icon(
    name: String,
    svg_content: String,
    state: State<'_, AppState>,
) -> Result<HubIcon, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/hub/icons"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "name": name, "svg_content": svg_content }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json::<HubIcon>().await.map_err(|e| format!("Parse error: {e}"))
}

#[tauri::command]
async fn rename_hub_icon(
    icon_id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .patch(format!("{hub_url}/hub/icons/{icon_id}"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "name": name }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn delete_hub_icon(
    icon_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!("{hub_url}/hub/icons/{icon_id}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn approve_member(
    target_public_key: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/hub/pending/{target_public_key}/approve"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn list_hub_members(
    state: State<'_, AppState>,
) -> Result<Vec<MemberAdminInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/hub/members"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn kick_user_cmd(
    target_public_key: String,
    reason: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    post_moderation(&state, "moderation/kick", serde_json::json!({
        "target_public_key": target_public_key,
        "reason": reason,
    }))
    .await
}

#[tauri::command]
async fn ban_user_cmd(
    target_public_key: String,
    reason: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    post_moderation(&state, "moderation/bans", serde_json::json!({
        "target_public_key": target_public_key,
        "reason": reason,
    }))
    .await
}

#[tauri::command]
async fn mute_user_cmd(
    target_public_key: String,
    reason: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    post_moderation(&state, "moderation/mutes", serde_json::json!({
        "target_public_key": target_public_key,
        "reason": reason,
    }))
    .await
}

#[tauri::command]
async fn timeout_user_cmd(
    target_public_key: String,
    duration_seconds: u64,
    reason: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    post_moderation(&state, "moderation/timeout", serde_json::json!({
        "target_public_key": target_public_key,
        "duration_seconds": duration_seconds,
        "reason": reason,
    }))
    .await
}

#[derive(Serialize, Deserialize, Clone)]
struct ChannelBanInfo {
    channel_id: String,
    target_public_key: String,
    banned_by: String,
    reason: Option<String>,
    created_at: i64,
}

#[tauri::command]
async fn channel_ban_user(
    channel_id: String,
    target_public_key: String,
    reason: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!(
            "{hub_url}/moderation/channels/{channel_id}/bans"
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "target_public_key": target_public_key,
            "reason": reason,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn channel_unban_user(
    channel_id: String,
    target_public_key: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!(
            "{hub_url}/moderation/channels/{channel_id}/bans/{target_public_key}"
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn list_channel_bans(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<ChannelBanInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!(
            "{hub_url}/moderation/channels/{channel_id}/bans"
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[derive(Serialize, Deserialize, Clone)]
struct VoiceMuteInfo {
    target_public_key: String,
    muted_by: String,
    reason: Option<String>,
    created_at: i64,
}

#[tauri::command]
async fn voice_mute_user_cmd(
    target_public_key: String,
    reason: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    post_moderation(&state, "moderation/voice-mutes", serde_json::json!({
        "target_public_key": target_public_key,
        "reason": reason,
    }))
    .await
}

#[tauri::command]
async fn voice_unmute_user_cmd(
    target_public_key: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!("{hub_url}/moderation/voice-mutes/{target_public_key}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn list_voice_mutes(state: State<'_, AppState>) -> Result<Vec<VoiceMuteInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/moderation/voice-mutes"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[derive(Serialize, Deserialize, Clone)]
struct TalkPowerInfo {
    channel_id: String,
    min_talk_power: i64,
}

#[tauri::command]
async fn get_talk_power(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<TalkPowerInfo, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .get(format!("{hub_url}/channels/{channel_id}/talk-power"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn set_talk_power_cmd(
    channel_id: String,
    min_talk_power: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/channels/{channel_id}/talk-power"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "min_talk_power": min_talk_power }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

async fn post_moderation(
    state: &State<'_, AppState>,
    path: &str,
    body: serde_json::Value,
) -> Result<(), String> {
    let (hub_url, token) = active_session(state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/{path}"))
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn assign_role(
    target_public_key: String,
    role_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .put(format!("{hub_url}/users/{target_public_key}/roles/{role_id}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn unassign_role(
    target_public_key: String,
    role_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!("{hub_url}/users/{target_public_key}/roles/{role_id}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn list_roles(state: State<'_, AppState>) -> Result<Vec<RoleInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    client
        .get(format!("{hub_url}/roles"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn create_role(
    name: String,
    permissions: Vec<String>,
    priority: i64,
    display_separately: Option<bool>,
    state: State<'_, AppState>,
) -> Result<RoleInfo, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/roles"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "name": name,
            "permissions": permissions,
            "priority": priority,
            "display_separately": display_separately.unwrap_or(false),
        }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn update_role(
    role_id: String,
    name: Option<String>,
    permissions: Option<Vec<String>>,
    priority: Option<i64>,
    display_separately: Option<bool>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .patch(format!("{hub_url}/roles/{role_id}"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "name": name,
            "permissions": permissions,
            "priority": priority,
            "display_separately": display_separately,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn delete_role(role_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!("{hub_url}/roles/{role_id}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn get_me(state: State<'_, AppState>) -> Result<MeInfo, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    client
        .get(format!("{hub_url}/me"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn get_hub_branding(state: State<'_, AppState>) -> Result<HubBranding, String> {
    let (hub_url, _) = active_session(&state)?;
    let client = state.http_client.clone();
    let info: InfoResponse = client
        .get(format!("{hub_url}/info"))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))?;
    Ok(HubBranding {
        name: info.name,
        description: info.description,
        icon: info.icon,
    })
}

#[tauri::command]
async fn update_hub_branding(
    name: Option<String>,
    description: Option<String>,
    icon: Option<String>,
    require_approval: Option<bool>,
    min_security_level: Option<u32>,
    max_channel_depth: Option<u32>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .patch(format!("{hub_url}/hub"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "name": name,
            "description": description,
            "icon": icon,
            "require_approval": require_approval,
            "min_security_level": min_security_level,
            "max_channel_depth": max_channel_depth,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }

    // Update the in-memory branding in the active session so list_hubs reflects it.
    if let Some(active_id) = state.active_hub.lock().unwrap().clone() {
        if let Some(s) = state.hubs.lock().unwrap().get_mut(&active_id) {
            if let Some(new_name) = name {
                s.hub_name = new_name;
            }
            if let Some(new_icon) = icon {
                s.hub_icon = if new_icon.is_empty() { None } else { Some(new_icon) };
            }
        }
    }

    Ok(())
}

/// Input type for one hub entry when publishing a public hub profile.
#[derive(Serialize, Deserialize)]
struct PublicHubEntryInput {
    hub_url: String,
    hub_name: String,
    joined_at: u64,
}

/// Publish or update the signed public hub profile for the current identity.
/// Signs with the local identity key and PUTs to the active hub.
#[tauri::command]
async fn save_public_profile(
    entries: Vec<PublicHubEntryInput>,
    display_name: String,
    avatar: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    use crate::identity::{PublicHubEntry, PublicHubProfile};

    let identity_path = Identity::default_path().map_err(|e| format!("Identity path: {e}"))?;
    let identity = Identity::load(&identity_path).map_err(|e| format!("Load identity: {e}"))?;
    let pubkey = identity.public_key_hex();

    let issued_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let public_hubs: Vec<PublicHubEntry> = entries
        .into_iter()
        .map(|e| PublicHubEntry {
            hub_url: e.hub_url,
            hub_name: e.hub_name,
            joined_at: e.joined_at,
        })
        .collect();

    let signing_bytes = PublicHubProfile::signing_bytes(&pubkey, &public_hubs, issued_at);
    let signature = hex::encode(identity.sign(&signing_bytes).to_bytes());

    let profile = PublicHubProfile {
        pubkey: pubkey.clone(),
        display_name,
        avatar,
        public_hubs,
        issued_at,
        signature,
    };

    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .put(format!("{hub_url}/profile/{pubkey}"))
        .bearer_auth(&token)
        .json(&profile)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Hub rejected profile update: {}",
            resp.text().await.unwrap_or_default()
        ));
    }

    Ok(())
}

/// Fetch the public hub profile for any user from any hub.
/// Returns None if the profile is not found (404), or Err on other failures.
#[tauri::command]
async fn fetch_public_profile(
    hub_url: String,
    pubkey: String,
) -> Result<Option<serde_json::Value>, String> {
    let client = reqwest::Client::new();
    let hub_url = hub_url.trim_end_matches('/');
    let resp = client
        .get(format!("{hub_url}/profile/{pubkey}"))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }

    if !resp.status().is_success() {
        return Err(format!(
            "Hub returned error: {}",
            resp.text().await.unwrap_or_default()
        ));
    }

    let v: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse response: {e}"))?;
    Ok(Some(v))
}

/// Sign a directory listing with the hub's private key and submit it to the
/// Voxply discovery directory. The hub must be the active session.
#[tauri::command]
async fn submit_to_directory(
    directory_url: String,
    tags: Vec<String>,
    language: String,
    bio: String,
    invite_code: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();

    // Step 1: ask the hub to sign the canonical payload
    let sign_resp = client
        .post(format!("{hub_url}/admin/directory-sign"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "hub_url": hub_url,
            "tags": tags,
            "language": language,
            "bio": bio,
            "invite_code": invite_code,
        }))
        .send()
        .await
        .map_err(|e| format!("Sign request failed: {e}"))?;

    if !sign_resp.status().is_success() {
        return Err(format!("Hub refused to sign: {}", sign_resp.text().await.unwrap_or_default()));
    }

    let signed: serde_json::Value = sign_resp.json().await
        .map_err(|e| format!("Sign response decode: {e}"))?;

    // Step 2: submit the signed payload to the directory
    let dir_base = directory_url.trim_end_matches('/');
    let submit_resp = client
        .post(format!("{dir_base}/api/hubs"))
        .json(&serde_json::json!({
            "hub_url": hub_url,
            "tags": tags,
            "language": language,
            "bio": bio,
            "invite_code": invite_code,
            "canonical_payload": signed["canonical_payload"],
            "hub_pubkey": signed["hub_pubkey"],
            "signature": signed["signature"],
        }))
        .send()
        .await
        .map_err(|e| format!("Directory submit failed: {e}"))?;

    if !submit_resp.status().is_success() {
        return Err(format!(
            "Directory rejected submission: {}",
            submit_resp.text().await.unwrap_or_default()
        ));
    }

    Ok(())
}

#[tauri::command]
async fn list_friends(state: State<'_, AppState>) -> Result<Vec<FriendInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    client
        .get(format!("{hub_url}/friends"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn list_pending_friends(state: State<'_, AppState>) -> Result<Vec<FriendInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    client
        .get(format!("{hub_url}/friends/pending"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn send_friend_request(
    target_public_key: String,
    friend_hub_url: Option<String>,
    display_name: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/friends"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "target_public_key": target_public_key,
            "hub_url": friend_hub_url,
            "display_name": display_name,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn accept_friend(from_public_key: String, state: State<'_, AppState>) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/friends/{from_public_key}/accept"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn remove_friend(target_public_key: String, state: State<'_, AppState>) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .delete(format!("{hub_url}/friends/{target_public_key}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn list_conversations(state: State<'_, AppState>) -> Result<Vec<ConversationInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    client
        .get(format!("{hub_url}/conversations"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn create_conversation(
    members: Vec<String>,
    member_hubs: Option<HashMap<String, String>>,
    state: State<'_, AppState>,
) -> Result<ConversationInfo, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client
        .post(format!("{hub_url}/conversations"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "members": members,
            "member_hubs": member_hubs.unwrap_or_default(),
        }))
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid: {e}"))
}

#[tauri::command]
async fn get_dm_messages(
    conversation_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<DmMessageInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let raw: Vec<RawDmMessageResponse> = client
        .get(format!("{hub_url}/conversations/{conversation_id}/messages"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))?;

    let identity_path = crate::identity::Identity::default_path().map_err(|e| e.to_string())?;
    let identity = crate::identity::Identity::load(&identity_path).ok();

    let mut result = Vec::with_capacity(raw.len());
    for msg in raw {
        let content = if msg.is_encrypted {
            if let (Some(env), Some(ref id)) = (&msg.encrypted_envelope, &identity) {
                decrypt_dm_inner(&conversation_id, env, id).unwrap_or_else(|_| "[decryption failed]".to_string())
            } else {
                "[encrypted]".to_string()
            }
        } else {
            msg.content.unwrap_or_default()
        };
        result.push(DmMessageInfo {
            id: msg.id,
            conversation_id: msg.conversation_id,
            sender: msg.sender,
            sender_name: msg.sender_name,
            content,
            created_at: msg.created_at,
            attachments: msg.attachments,
            is_encrypted: msg.is_encrypted,
            delivery_failed: msg.delivery_failed,
        });
    }
    Ok(result)
}

fn decrypt_dm_inner(conv_id: &str, envelope: &serde_json::Value, identity: &crate::identity::Identity) -> Result<String, String> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Key, Nonce};
    use hkdf::Hkdf;
    use sha2::Sha256;

    let (my_dh_sec, _) = identity.dh_keypair();
    let sender_dh_hex = envelope["dh_pubkey_hex"].as_str().ok_or("missing dh_pubkey_hex")?;
    let ciphertext_hex = envelope["ciphertext_hex"].as_str().ok_or("missing ciphertext_hex")?;
    let nonce_hex = envelope["nonce_hex"].as_str().ok_or("missing nonce_hex")?;

    let sender_bytes = hex::decode(sender_dh_hex).map_err(|e| e.to_string())?;
    let sender_arr: [u8; 32] = sender_bytes.try_into().map_err(|_| "bad DH key".to_string())?;
    let sender_pub = x25519_dalek::PublicKey::from(sender_arr);
    let shared = my_dh_sec.diffie_hellman(&sender_pub);

    let hk = Hkdf::<Sha256>::new(Some(conv_id.as_bytes()), shared.as_bytes());
    let mut key_bytes = [0u8; 32];
    hk.expand(b"voxply/dm-key/v1", &mut key_bytes).map_err(|e| e.to_string())?;

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_bytes));
    let nonce_bytes = hex::decode(nonce_hex).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = hex::decode(ciphertext_hex).map_err(|e| e.to_string())?;
    let plaintext_bytes = cipher.decrypt(nonce, ct.as_slice()).map_err(|_| "decryption failed".to_string())?;
    let plaintext: serde_json::Value = serde_json::from_slice(&plaintext_bytes).map_err(|e| e.to_string())?;
    Ok(plaintext["content"].as_str().unwrap_or("").to_string())
}

#[tauri::command]
async fn send_dm(
    conversation_id: String,
    content: Option<String>,
    attachments: Option<Vec<AttachmentInfo>>,
    encrypted_envelope: Option<serde_json::Value>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let body = if let Some(env) = encrypted_envelope {
        serde_json::json!({
            "encrypted_envelope": env,
            "attachments": attachments.unwrap_or_default(),
        })
    } else {
        serde_json::json!({
            "content": content.unwrap_or_default(),
            "attachments": attachments.unwrap_or_default(),
        })
    };
    let resp = client
        .post(format!("{hub_url}/conversations/{conversation_id}/messages"))
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

/// Update the tray tooltip + title to reflect current unread count. Called
/// from the frontend whenever the aggregated unread number changes.
#[tauri::command]
fn set_tray_unread(count: u32, app: AppHandle) -> Result<(), String> {
    let tray = app.tray_by_id("main").ok_or("tray missing")?;
    let label = if count == 0 {
        "Voxply".to_string()
    } else if count > 99 {
        "Voxply — 99+ unread".to_string()
    } else {
        format!("Voxply — {count} unread")
    };
    tray.set_tooltip(Some(&label)).map_err(|e| e.to_string())?;
    Ok(())
}

/// Background update check — fires once at startup and is entirely best-effort.
/// Any error is logged at WARN level; nothing is propagated to the caller.
async fn check_for_updates(app: AppHandle) {
    use tauri_plugin_updater::UpdaterExt;

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            tracing::warn!("updater unavailable: {e}");
            return;
        }
    };

    let update = match updater.check().await {
        Ok(Some(u)) => u,
        Ok(None) => return,
        Err(e) => {
            tracing::warn!("update check failed: {e}");
            return;
        }
    };

    #[derive(Clone, serde::Serialize)]
    struct UpdatePayload {
        version: String,
        notes: Option<String>,
    }

    let _ = app.emit(
        "update-available",
        UpdatePayload {
            version: update.version.clone(),
            notes: update.body.clone(),
        },
    );

    if let Err(e) = update
        .download_and_install(|_, _| {}, || {})
        .await
    {
        tracing::warn!("update download/install failed: {e}");
    }
}

// ---------------------------------------------------------------------------
// E2E DM encryption commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn publish_dh_key(state: State<'_, AppState>) -> Result<(), String> {
    let identity_path = crate::identity::Identity::default_path()
        .map_err(|e| e.to_string())?;
    let identity = crate::identity::Identity::load(&identity_path)
        .map_err(|e| e.to_string())?;
    let (_, dh_pub) = identity.dh_keypair();
    let dh_pubkey_hex = hex::encode(dh_pub.as_bytes());
    let sig_bytes = {
        let msg = crate::identity::DhKeyRecord::signing_bytes(
            &identity.public_key_hex(), &dh_pubkey_hex,
        );
        identity.sign(&msg).to_bytes()
    };
    let signature_hex = hex::encode(sig_bytes);
    let pubkey_hex = identity.public_key_hex();

    // Collect hub urls + tokens before any await so the MutexGuard is dropped.
    let hub_sessions: Vec<(String, String)> = {
        let sessions = state.hubs.lock().unwrap();
        sessions.values()
            .map(|s| (s.hub_url.clone(), s.token.clone()))
            .collect()
    };

    for (hub_url, token) in hub_sessions {
        let url = format!("{}/identity/{}/dh-key", hub_url, pubkey_hex);
        let client = state.http_client.clone();
        let _ = client.put(&url)
            .bearer_auth(&token)
            .json(&serde_json::json!({
                "dh_pubkey_hex": &dh_pubkey_hex,
                "signature_hex": &signature_hex,
            }))
            .send()
            .await;
    }
    Ok(())
}

#[tauri::command]
async fn fetch_dh_key(
    pubkey: String,
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let url = format!("{}/identity/{}/dh-key", hub_url, pubkey);
    // Drop the MutexGuard before the first await.
    let token: Option<String> = {
        let sessions = state.hubs.lock().unwrap();
        sessions.values()
            .find(|s| s.hub_url == hub_url)
            .map(|s| s.token.clone())
    };
    let client = state.http_client.clone();
    let mut req = client.get(&url);
    if let Some(t) = token {
        req = req.bearer_auth(t);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !resp.status().is_success() {
        return Err(format!("hub returned {}", resp.status()));
    }
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(body["dh_pubkey_hex"].as_str().map(|s| s.to_string()))
}

#[tauri::command]
async fn encrypt_dm(
    conv_id: String,
    content: String,
    recipient_dh_pubkey_hex: String,
) -> Result<serde_json::Value, String> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Key, Nonce};
    use hkdf::Hkdf;
    use rand::RngCore;
    use sha2::Sha256;

    let identity_path = crate::identity::Identity::default_path()
        .map_err(|e| e.to_string())?;
    let identity = crate::identity::Identity::load(&identity_path)
        .map_err(|e| e.to_string())?;
    let (my_dh_sec, my_dh_pub) = identity.dh_keypair();

    let rec_bytes = hex::decode(&recipient_dh_pubkey_hex).map_err(|e| e.to_string())?;
    let rec_arr: [u8; 32] = rec_bytes
        .try_into()
        .map_err(|_| "bad DH key length".to_string())?;
    let rec_pub = x25519_dalek::PublicKey::from(rec_arr);

    let shared = my_dh_sec.diffie_hellman(&rec_pub);

    let hk = Hkdf::<Sha256>::new(Some(conv_id.as_bytes()), shared.as_bytes());
    let mut key_bytes = [0u8; 32];
    hk.expand(b"voxply/dm-key/v1", &mut key_bytes)
        .map_err(|e| e.to_string())?;

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_bytes));
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = serde_json::json!({ "content": content }).to_string();
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| e.to_string())?;

    let ciphertext_hex = hex::encode(&ciphertext);
    let nonce_hex = hex::encode(nonce_bytes);
    let dh_pubkey_hex = hex::encode(my_dh_pub.as_bytes());

    let signing_msg = {
        let mut out = b"voxply/dm-ciphertext/v1\0".to_vec();
        for s in [&conv_id, &ciphertext_hex, &nonce_hex, &dh_pubkey_hex] {
            let b = s.as_bytes();
            out.extend_from_slice(&(b.len() as u32).to_le_bytes());
            out.extend_from_slice(b);
        }
        out
    };
    let sig = hex::encode(identity.sign(&signing_msg).to_bytes());

    Ok(serde_json::json!({
        "sender_pubkey": identity.public_key_hex(),
        "conv_id": conv_id,
        "ciphertext_hex": ciphertext_hex,
        "nonce_hex": nonce_hex,
        "dh_pubkey_hex": dh_pubkey_hex,
        "signature_hex": sig,
    }))
}

#[tauri::command]
async fn decrypt_dm(
    conv_id: String,
    envelope: serde_json::Value,
) -> Result<String, String> {
    let identity_path = crate::identity::Identity::default_path().map_err(|e| e.to_string())?;
    let identity = crate::identity::Identity::load(&identity_path).map_err(|e| e.to_string())?;
    decrypt_dm_inner(&conv_id, &envelope, &identity)
}

// ---------------------------------------------------------------------------
// Bot management commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn list_bots(state: State<'_, AppState>) -> Result<Vec<BotInfo>, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    client.get(format!("{hub_url}/bots"))
        .bearer_auth(&token)
        .send().await.map_err(|e| format!("Request failed: {e}"))?
        .json().await.map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
async fn create_bot(name: String, state: State<'_, AppState>) -> Result<BotInfo, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client.post(format!("{hub_url}/bots"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "name": name }))
        .send().await.map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        let msg = resp.text().await.unwrap_or_default();
        return Err(msg);
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
async fn delete_bot(public_key: String, state: State<'_, AppState>) -> Result<(), String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client.delete(format!("{hub_url}/bots/{public_key}"))
        .bearer_auth(&token)
        .send().await.map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        let msg = resp.text().await.unwrap_or_default();
        return Err(msg);
    }
    Ok(())
}

#[tauri::command]
async fn rotate_bot_token(public_key: String, state: State<'_, AppState>) -> Result<String, String> {
    let (hub_url, token) = active_session(&state)?;
    let client = state.http_client.clone();
    let resp = client.post(format!("{hub_url}/bots/{public_key}/rotate-token"))
        .bearer_auth(&token)
        .send().await.map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        let msg = resp.text().await.unwrap_or_default();
        return Err(msg);
    }
    let v: serde_json::Value = resp.json().await.map_err(|e| format!("Invalid response: {e}"))?;
    v["token"].as_str().map(|s| s.to_string()).ok_or("Missing token in response".to_string())
}

// =============================================================================
// Feature: Self-service bot management (admin commands)
// =============================================================================

#[derive(serde::Serialize, serde::Deserialize)]
struct BotAdminInfo {
    public_key: String,
    display_name: String,
    created_by: String,
    created_at: i64,
    webhook_url: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct BotCreatedResult {
    public_key: String,
    display_name: String,
    created_by: String,
    created_at: i64,
    token: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct BotSlashCommandInfo {
    command: String,
    description: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct BotDetailInfo {
    public_key: String,
    display_name: String,
    created_by: String,
    created_at: i64,
    webhook_url: Option<String>,
    commands: Vec<BotSlashCommandInfo>,
}

#[tauri::command]
async fn admin_list_bots(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<Vec<BotAdminInfo>, String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/admin/bots"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
async fn admin_create_bot(
    hub_url: String,
    display_name: String,
    state: State<'_, AppState>,
) -> Result<BotCreatedResult, String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/admin/bots"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "display_name": display_name }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
async fn admin_delete_bot(
    hub_url: String,
    pubkey: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .delete(format!("{base}/admin/bots/{pubkey}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn admin_set_bot_webhook(
    hub_url: String,
    pubkey: String,
    webhook_url: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .put(format!("{base}/admin/bots/{pubkey}/webhook"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "webhook_url": webhook_url }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn admin_get_bot_detail(
    hub_url: String,
    pubkey: String,
    state: State<'_, AppState>,
) -> Result<BotDetailInfo, String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/admin/bots/{pubkey}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

// =============================================================================
// Feature: Component interactions (bot buttons / selects)
// =============================================================================

#[tauri::command]
async fn send_component_interaction(
    hub_url: String,
    message_id: String,
    custom_id: String,
    values: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let hubs = state.hubs.lock().unwrap();
    let session = hubs
        .values()
        .find(|s| s.hub_url.trim_end_matches('/') == hub_url.trim_end_matches('/'))
        .ok_or_else(|| format!("No active session for hub: {hub_url}"))?;
    let tx = session.ws_tx.clone();
    drop(hubs);
    let payload = serde_json::json!({
        "type": "component_interaction",
        "message_id": message_id,
        "custom_id": custom_id,
        "values": values,
    });
    tx.send(WsCommand::Raw(payload.to_string()))
        .map_err(|_| "WS closed".to_string())
}

// =============================================================================
// Feature: Bot profile (public card)
// =============================================================================

#[derive(Serialize, Deserialize)]
struct BotCommandDef {
    name: String,
    description: String,
}

#[derive(Serialize, Deserialize)]
struct BotProfileResult {
    pubkey: String,
    name: String,
    avatar_url: Option<String>,
    description: Option<String>,
    commands: Vec<BotCommandDef>,
}

#[tauri::command]
async fn get_bot_profile(
    hub_url: String,
    pubkey: String,
    state: State<'_, AppState>,
) -> Result<BotProfileResult, String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/bots/{pubkey}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

// =============================================================================
// Feature: External bots
// =============================================================================

#[derive(Serialize, Deserialize, Clone)]
struct ExternalBotRow {
    public_key: String,
    display_name: Option<String>,
    local_note: Option<String>,
    approval_status: String,
    last_seen_at: Option<i64>,
}

#[derive(Serialize, Deserialize)]
struct ExternalBotInviteResult {
    bot_invite_token: String,
    pubkey: String,
}

#[tauri::command]
async fn admin_list_external_bots(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<Vec<ExternalBotRow>, String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/admin/bots/external"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
async fn admin_add_external_bot(
    hub_url: String,
    pubkey: String,
    local_note: Option<String>,
    state: State<'_, AppState>,
) -> Result<ExternalBotInviteResult, String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/admin/bots/external"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "pubkey": pubkey, "local_note": local_note }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
async fn admin_remove_external_bot(
    hub_url: String,
    pubkey: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .delete(format!("{base}/admin/bots/external/{pubkey}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn admin_set_bot_channel_scope(
    hub_url: String,
    pubkey: String,
    channel_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .put(format!("{base}/admin/bots/{pubkey}/channels"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "channel_ids": channel_ids }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

// =============================================================================
// Feature: Incoming Webhooks
// =============================================================================

#[derive(Serialize, Deserialize, Clone)]
struct WebhookInfo {
    id: String,
    display_name: String,
    channel_id: String,
    channel_name: Option<String>,
    webhook_url: String,
    created_by: String,
    created_at: i64,
}

#[derive(Serialize, Deserialize)]
struct WebhookCreatedResult {
    id: String,
    webhook_url: String,
}

#[tauri::command]
async fn admin_list_webhooks(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<Vec<WebhookInfo>, String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/admin/webhooks"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
async fn admin_create_webhook(
    hub_url: String,
    channel_id: String,
    display_name: String,
    avatar_url: Option<String>,
    state: State<'_, AppState>,
) -> Result<WebhookCreatedResult, String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/admin/webhooks"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "channel_id": channel_id,
            "display_name": display_name,
            "avatar_url": avatar_url,
        }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
async fn admin_regenerate_webhook(
    hub_url: String,
    webhook_id: String,
    state: State<'_, AppState>,
) -> Result<WebhookCreatedResult, String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .patch(format!("{base}/admin/webhooks/{webhook_id}"))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
async fn admin_delete_webhook(
    hub_url: String,
    webhook_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .delete(format!("{base}/admin/webhooks/{webhook_id}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

// =============================================================================
// Feature: Security Level Lobby
// =============================================================================

#[derive(Serialize, Deserialize, Clone)]
struct LobbyStatusResult {
    status: String,
    required_level: u32,
    current_level: u32,
    entered_at: Option<i64>,
    welcome_md: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct LobbySubmitResult {
    promoted: bool,
    new_level: u32,
}

#[derive(Serialize, Deserialize, Clone)]
struct LobbyWelcome {
    welcome_md: String,
    hub_name: String,
    required_level: u32,
}

#[tauri::command]
async fn lobby_status(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<LobbyStatusResult, String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/lobby/status"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
async fn lobby_submit_proof(
    hub_url: String,
    pow_proof: String,
    state: State<'_, AppState>,
) -> Result<LobbySubmitResult, String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/lobby/submit-pow"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "pow_proof": pow_proof }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
async fn lobby_get_welcome(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<LobbyWelcome, String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/lobby/welcome"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
async fn set_lobby_settings(
    hub_url: String,
    lobby_enabled: bool,
    welcome_md: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .put(format!("{base}/hub/settings/lobby"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "lobby_enabled": lobby_enabled, "welcome_md": welcome_md }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

// =============================================================================
// Feature: Bot Challenge
// =============================================================================

#[derive(Serialize, Deserialize, Clone)]
struct ChallengePrompt {
    id: String,
    mode: String,
    prompt_svg: Option<String>,
    expires_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
struct ChallengeResult {
    ok: bool,
    token: Option<String>,
    expires_at: Option<i64>,
    next_challenge: Option<ChallengePrompt>,
    attempts_remaining: Option<u32>,
}

#[tauri::command]
async fn challenge_fetch(
    hub_url: String,
    pubkey: String,
    state: State<'_, AppState>,
) -> Result<ChallengePrompt, String> {
    let base = hub_url.trim_end_matches('/');
    // No auth needed for /challenge/new
    let resp = state
        .http_client
        .get(format!("{base}/challenge/new"))
        .query(&[("pubkey", &pubkey)])
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
async fn challenge_submit(
    hub_url: String,
    id: String,
    pubkey: String,
    answer: Option<String>,
    state: State<'_, AppState>,
) -> Result<ChallengeResult, String> {
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/challenge/verify"))
        .json(&serde_json::json!({ "id": id, "pubkey": pubkey, "answer": answer }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
async fn set_challenge_settings(
    hub_url: String,
    challenge_mode: String,
    challenge_difficulty: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .put(format!("{base}/hub/settings/challenge"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "challenge_mode": challenge_mode,
            "challenge_difficulty": challenge_difficulty,
        }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

// =============================================================================
// Feature: Farm management commands
// =============================================================================

#[derive(Serialize, Deserialize, Clone)]
struct FarmPublicInfo {
    kind: Option<String>,
    name: String,
    description: String,
    creation_policy: String,
    hub_count: u32,
    max_hubs_total: u32,
    allow_discovery_listing: bool,
    country: String,
    region: String,
    languages: Vec<String>,
    tags: Vec<String>,
    icon: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct FarmHubQuota {
    hubs_owned_by_user: u32,
    max_hubs_per_user: u32,
    total_hubs: u32,
    max_hubs_total: u32,
    can_create: bool,
    reason: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct FarmSettings {
    name: String,
    description: String,
    creation_policy: String,
    max_hubs_per_user: u32,
    max_hubs_total: u32,
    allow_discovery_listing: bool,
    directory_public: bool,
    languages: Vec<String>,
    tags: Vec<String>,
    country: String,
    region: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct CreatedFarmHub {
    id: String,
    url: String,
    hub_pubkey: String,
    name: String,
    visibility: String,
    created_at: i64,
}

/// `GET {hub_url}/info` — no auth. Returns raw JSON (client reads `farm_url` from it).
#[tauri::command]
async fn get_hub_info(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/info"))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

/// `GET {farm_url}/farm/info` — no auth.
#[tauri::command]
async fn get_farm_info(
    farm_url: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/farm/info"))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

/// `GET {farm_url}/farm/public-info` — no auth.
#[tauri::command]
async fn probe_farm(
    farm_url: String,
    state: State<'_, AppState>,
) -> Result<FarmPublicInfo, String> {
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/farm/public-info"))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

/// `GET {farm_url}/farm/me/hub-quota` — requires farm session token.
#[tauri::command]
async fn get_farm_hub_quota(
    farm_url: String,
    state: State<'_, AppState>,
) -> Result<FarmHubQuota, String> {
    let token = session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/farm/me/hub-quota"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

/// `GET {farm_url}/farm/settings` — requires farm session token.
#[tauri::command]
async fn get_farm_settings(
    farm_url: String,
    state: State<'_, AppState>,
) -> Result<FarmSettings, String> {
    let token = session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/farm/settings"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

/// `PATCH {farm_url}/farm/settings` — requires farm session token.
#[tauri::command]
async fn patch_farm_settings(
    farm_url: String,
    settings: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<FarmSettings, String> {
    let token = session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .patch(format!("{base}/farm/settings"))
        .bearer_auth(&token)
        .json(&settings)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

/// `GET {farm_url}/farm/hubs` — requires farm session token. Returns `{ hubs: [...] }`.
#[tauri::command]
async fn get_farm_hubs_admin(
    farm_url: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/farm/hubs"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

/// Suspend or unsuspend a farm hub — requires farm session token.
#[tauri::command]
async fn suspend_farm_hub(
    farm_url: String,
    hub_id: String,
    suspended: bool,
    reason: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = if suspended {
        state
            .http_client
            .patch(format!("{base}/farm/hubs/{hub_id}/suspend"))
            .bearer_auth(&token)
            .json(&serde_json::json!({ "reason": reason }))
            .send()
            .await
            .map_err(|e| format!("Request failed: {e}"))?
    } else {
        state
            .http_client
            .patch(format!("{base}/farm/hubs/{hub_id}/unsuspend"))
            .bearer_auth(&token)
            .json(&serde_json::json!({}))
            .send()
            .await
            .map_err(|e| format!("Request failed: {e}"))?
    };
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

/// `DELETE {farm_url}/farm/hubs/{hub_id}` — requires farm session token.
#[tauri::command]
async fn delete_farm_hub(
    farm_url: String,
    hub_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .delete(format!("{base}/farm/hubs/{hub_id}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

/// `GET {farm_url}/farm/users?limit={limit}&page={page}` — requires farm session token.
#[tauri::command]
async fn get_farm_users(
    farm_url: String,
    page: Option<u32>,
    limit: Option<u32>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let token = session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let mut req = state
        .http_client
        .get(format!("{base}/farm/users"))
        .bearer_auth(&token);
    if let Some(p) = page {
        req = req.query(&[("page", p.to_string())]);
    }
    if let Some(l) = limit {
        req = req.query(&[("limit", l.to_string())]);
    }
    let resp = req.send().await.map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

/// `POST {farm_url}/farm/users/{pubkey}/revoke-sessions` — requires farm session token.
#[tauri::command]
async fn revoke_farm_user_sessions(
    farm_url: String,
    pubkey: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/farm/users/{pubkey}/revoke-sessions"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

/// `POST {farm_url}/farm/hubs` with `{ name, description, visibility }` — requires farm session token.
#[tauri::command]
async fn create_hub_on_farm(
    farm_url: String,
    name: String,
    description: Option<String>,
    visibility: String,
    state: State<'_, AppState>,
) -> Result<CreatedFarmHub, String> {
    let token = session_for_url(&state, &farm_url)?;
    let base = farm_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/farm/hubs"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "name": name,
            "description": description,
            "visibility": visibility,
        }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

/// Connect to a hub by URL without an invite code. Wraps `add_hub`.
#[tauri::command]
async fn add_hub_by_url(
    hub_url: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<HubInfo, String> {
    add_hub(hub_url, None, state, app).await
}

// =============================================================================
// Feature: Role Questionnaire / Onboarding Survey
// =============================================================================

#[derive(Serialize, Deserialize, Clone)]
struct SurveyChoiceTs {
    id: String,
    label: String,
    display_order: i64,
}

#[derive(Serialize, Deserialize, Clone)]
struct SurveyQuestionTs {
    id: String,
    prompt: String,
    kind: String,
    required: bool,
    display_order: i64,
    choices: Option<Vec<SurveyChoiceTs>>,
}

#[derive(Serialize, Deserialize, Clone)]
struct SurveyPublicTs {
    id: String,
    questions: Vec<SurveyQuestionTs>,
}

#[derive(Serialize, Deserialize, Clone)]
struct SurveyChoiceAdminTs {
    id: String,
    label: String,
    display_order: i64,
    role_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct SurveyQuestionAdminTs {
    id: String,
    prompt: String,
    kind: String,
    required: bool,
    display_order: i64,
    choices: Option<Vec<SurveyChoiceAdminTs>>,
}

#[derive(Serialize, Deserialize, Clone)]
struct SurveyAdminTs {
    id: String,
    enabled: bool,
    questions: Vec<SurveyQuestionAdminTs>,
}

#[derive(Serialize, Deserialize, Clone)]
struct SurveyAnswer {
    question_id: String,
    choice_id: Option<String>,
    text_answer: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct SurveySubmitResult {
    next_state: String,
    applied_roles: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct SurveyAnswerView {
    question_id: String,
    prompt: String,
    choice_label: Option<String>,
    text_answer: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct SurveyResponseAdminTs {
    response_id: String,
    pubkey: String,
    display_name: Option<String>,
    submitted_at: i64,
    answers: Vec<SurveyAnswerView>,
}

#[tauri::command]
async fn survey_current(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<Option<SurveyPublicTs>, String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/survey/current"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
async fn survey_submit(
    hub_url: String,
    survey_id: String,
    answers: Vec<SurveyAnswer>,
    state: State<'_, AppState>,
) -> Result<SurveySubmitResult, String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/survey/submit"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "survey_id": survey_id, "answers": answers }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
async fn survey_admin_get(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<Option<SurveyAdminTs>, String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/admin/survey"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
async fn survey_admin_put(
    hub_url: String,
    survey: SurveyAdminTs,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .put(format!("{base}/admin/survey"))
        .bearer_auth(&token)
        .json(&survey)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
async fn survey_admin_responses(
    hub_url: String,
    status: String,
    state: State<'_, AppState>,
) -> Result<Vec<SurveyResponseAdminTs>, String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/admin/survey/responses"))
        .bearer_auth(&token)
        .query(&[("status", &status)])
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json().await.map_err(|e| format!("Invalid response: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::TrayIconBuilder;

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            app.manage(AppState {
                hubs: Default::default(),
                active_hub: Default::default(),
                voice: Default::default(),
                http_client: reqwest::Client::new(),
            });
            app.manage(PendingDeepLink { url: std::sync::Mutex::new(None) });

            // Handle deep link if the app was launched via a voxply:// URL
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Ok(Some(urls)) = app.deep_link().get_current() {
                    for url in &urls {
                        let raw = url.as_str();
                        if raw.starts_with("voxply://") {
                            *app.state::<PendingDeepLink>().url.lock().unwrap() =
                                Some(raw.to_string());
                            break;
                        }
                    }
                }
                // Also handle deep links while the app is already running
                let handle = app.handle().clone();
                let _listener_id = app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        let raw = url.as_str();
                        if raw.starts_with("voxply://") {
                            if let Some(state) = handle.try_state::<PendingDeepLink>() {
                                *state.url.lock().unwrap() = Some(raw.to_string());
                            }
                            let _ = handle.emit("join-hub-requested", raw.to_string());
                            break;
                        }
                    }
                });
            }

            // Kick off a background update check — best-effort, never blocks startup.
            let update_handle = app.handle().clone();
            tauri::async_runtime::spawn(check_for_updates(update_handle));

            // System tray: a "Show Voxply" / "Quit" menu plus left-click to
            // focus the main window. Tooltip carries the unread count, kept
            // in sync by the frontend via set_tray_unread.
            let show = MenuItem::with_id(app, "show", "Show Voxply", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let _tray = TrayIconBuilder::with_id("main")
                .tooltip("Voxply")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    use tauri::tray::TrayIconEvent;
                    if let TrayIconEvent::Click { button, button_state, .. } = event {
                        if button == tauri::tray::MouseButton::Left
                            && button_state == tauri::tray::MouseButtonState::Up
                        {
                            if let Some(w) = tray.app_handle().get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            add_hub,
            list_hubs,
            ping_hub,
            set_active_hub,
            remove_hub,
            auto_connect_saved,
            list_channels,
            list_games,
            create_channel,
            update_channel_description,
            rename_channel,
            move_channel,
            update_channel_appearance,
            delete_channel,
            reorder_channels,
            list_users,
            get_messages,
            search_messages,
            voice_populations,
            voice_active_users,
            voice_channel_participants,
            add_reaction,
            remove_reaction,
            send_message,
            edit_message,
            delete_message,
            subscribe_channel,
            unsubscribe_channel,
            set_typing,
            set_dm_typing,
            reconnect_hub,
            reorder_hubs,
            preview_hub_info,
            get_pending_deep_link,
            clear_local_data,
            voice_join,
            voice_leave,
            voice_set_muted,
            voice_set_deafened,
            list_audio_devices,
            get_voice_settings,
            save_voice_settings,
            mic_test_start,
            mic_test_stop,
            update_display_name,
            update_avatar,
            get_profile,
            save_profile,
            get_recovery_phrase,
            recover_identity_from_phrase,
            get_my_public_key,
            get_me,
            get_hub_branding,
            update_hub_branding,
            list_roles,
            create_role,
            update_role,
            delete_role,
            get_hub_settings,
            list_pending_members,
            approve_member,
            list_hub_icons,
            create_hub_icon,
            rename_hub_icon,
            delete_hub_icon,
            list_hub_members,
            kick_user_cmd,
            ban_user_cmd,
            mute_user_cmd,
            timeout_user_cmd,
            voice_mute_user_cmd,
            voice_unmute_user_cmd,
            list_voice_mutes,
            channel_ban_user,
            channel_unban_user,
            list_channel_bans,
            set_tray_unread,
            load_unread_state,
            save_unread_state,
            load_notification_mutes,
            save_notification_mutes,
            load_pinned_channels,
            save_pinned_channels,
            load_collapsed_categories,
            save_collapsed_categories,
            load_blocked_users,
            save_blocked_users,
            get_talk_power,
            set_talk_power_cmd,
            assign_role,
            unassign_role,
            list_bans,
            unban_user,
            list_invites,
            create_invite,
            revoke_invite,
            list_alliances,
            create_alliance,
            get_alliance,
            create_alliance_invite,
            join_alliance,
            leave_alliance,
            send_alliance_push_invite,
            list_pending_alliance_invites,
            respond_to_alliance_invite,
            list_alliance_shared_channels,
            get_alliance_channel_messages,
            send_alliance_channel_message,
            share_channel_with_alliance,
            unshare_channel_from_alliance,
            submit_to_directory,
            list_friends,
            list_pending_friends,
            send_friend_request,
            accept_friend,
            remove_friend,
            list_conversations,
            create_conversation,
            get_dm_messages,
            send_dm,
            home_hub::set_home_hub_list,
            home_hub::get_home_hub_list,
            pairing::start_pairing_offer,
            pairing::poll_pairing_status,
            pairing::complete_pairing,
            pairing::home_hubs_from_offer,
            pairing::fingerprint_pubkey,
            pairing::parse_pairing_offer,
            pairing::claim_pairing_offer,
            pairing::save_paired_identity,
            pairing::get_paired_identity,
            devices::device_list,
            devices::device_revoke,
            devices::subkey_issue,
            push_prefs_blob,
            pull_and_apply_prefs_blob,
            save_public_profile,
            fetch_public_profile,
            get_hub_ws_info,
            publish_dh_key,
            fetch_dh_key,
            encrypt_dm,
            decrypt_dm,
            list_bots,
            create_bot,
            delete_bot,
            rotate_bot_token,
            admin_list_bots,
            admin_create_bot,
            admin_delete_bot,
            admin_set_bot_webhook,
            admin_get_bot_detail,
            send_component_interaction,
            get_bot_profile,
            admin_list_external_bots,
            admin_add_external_bot,
            admin_remove_external_bot,
            admin_set_bot_channel_scope,
            admin_list_webhooks,
            admin_create_webhook,
            admin_regenerate_webhook,
            admin_delete_webhook,
            lobby_status,
            lobby_submit_proof,
            lobby_get_welcome,
            set_lobby_settings,
            challenge_fetch,
            challenge_submit,
            set_challenge_settings,
            survey_current,
            survey_submit,
            survey_admin_get,
            survey_admin_put,
            survey_admin_responses,
            get_hub_info,
            get_farm_info,
            probe_farm,
            get_farm_hub_quota,
            get_farm_settings,
            patch_farm_settings,
            get_farm_hubs_admin,
            suspend_farm_hub,
            delete_farm_hub,
            get_farm_users,
            revoke_farm_user_sessions,
            create_hub_on_farm,
            add_hub_by_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ---------------------------------------------------------------------------
// Tests for pure helpers in this module. We deliberately avoid testing Tauri
// commands directly — those need a real AppHandle / State / running runtime.
// What we cover here is the boundary logic that doesn't need any of that:
// URL encoding, serde shapes (so a stored prefs file from a prior version
// still round-trips), and small pure helpers.
//
// To grow this: any function that takes plain values and returns plain
// values is fair game. Anything that touches `dirs::data_dir()` would need
// a refactor to take a base path before it's testable here.
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urlencoding_emoji_passes_unreserved_chars_through() {
        assert_eq!(urlencoding_emoji(""), "");
        assert_eq!(urlencoding_emoji("hello"), "hello");
        assert_eq!(urlencoding_emoji("a-b_c.d~e"), "a-b_c.d~e");
        assert_eq!(urlencoding_emoji("0123456789"), "0123456789");
    }

    #[test]
    fn urlencoding_emoji_percent_encodes_reserved_and_unicode() {
        // ASCII reserved
        assert_eq!(urlencoding_emoji(" "), "%20");
        assert_eq!(urlencoding_emoji("a/b"), "a%2Fb");
        assert_eq!(urlencoding_emoji("?&="), "%3F%26%3D");
        // Multi-byte UTF-8: thumbs-up emoji is 4 bytes (F0 9F 91 8D), each
        // gets percent-encoded individually.
        assert_eq!(urlencoding_emoji("👍"), "%F0%9F%91%8D");
        // Heart emoji (U+2764) is 3 bytes (E2 9D A4).
        assert_eq!(urlencoding_emoji("❤"), "%E2%9D%A4");
    }

    #[test]
    fn default_approval_status_is_approved() {
        // The default kicks in when a hub's /me response omits the field
        // (older hubs that don't know about the approval queue).
        assert_eq!(default_approval_status(), "approved");
    }

    #[test]
    fn local_profile_default_is_empty_with_no_theme() {
        let p = LocalProfile::default();
        assert!(p.profiles.is_empty());
        assert!(p.default_profile_id.is_none());
        assert!(p.theme.is_none());
        assert!(p.default_profile().is_none());
    }

    #[test]
    fn local_profile_default_profile_falls_back_to_first_when_id_stale() {
        let a = NamedProfile {
            id: "id-a".to_string(),
            label: "Profile A".to_string(),
            display_name: "Alice".to_string(),
            avatar: None,
        };
        let b = NamedProfile {
            id: "id-b".to_string(),
            label: "Profile B".to_string(),
            display_name: "Bob".to_string(),
            avatar: None,
        };
        let p = LocalProfile {
            profiles: vec![a.clone(), b.clone()],
            // ID points at a profile that no longer exists — should fall
            // back to the first profile rather than returning None.
            default_profile_id: Some("vanished".to_string()),
            theme: None,
        };
        assert_eq!(p.default_profile().unwrap().id, "id-a");
    }

    #[test]
    fn local_profile_default_profile_honors_explicit_id() {
        let a = NamedProfile {
            id: "id-a".to_string(),
            label: "Profile A".to_string(),
            display_name: "Alice".to_string(),
            avatar: None,
        };
        let b = NamedProfile {
            id: "id-b".to_string(),
            label: "Profile B".to_string(),
            display_name: "Bob".to_string(),
            avatar: None,
        };
        let p = LocalProfile {
            profiles: vec![a, b.clone()],
            default_profile_id: Some("id-b".to_string()),
            theme: None,
        };
        assert_eq!(p.default_profile().unwrap().id, "id-b");
    }

    #[test]
    fn saved_hub_round_trips_through_json() {
        let original = SavedHub {
            hub_id: "h1".to_string(),
            hub_name: "Hub One".to_string(),
            hub_url: "https://hub.example".to_string(),
        };
        let json = serde_json::to_string(&original).unwrap();
        let decoded: SavedHub = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.hub_id, original.hub_id);
        assert_eq!(decoded.hub_name, original.hub_name);
        assert_eq!(decoded.hub_url, original.hub_url);
    }

    #[test]
    fn stored_voice_settings_decodes_with_missing_fields() {
        // A prefs file from before we added voice_mode/ptt_key should still
        // load — that's why both fields are #[serde(default)].
        let old: StoredVoiceSettings =
            serde_json::from_str(r#"{"input_device":"mic","vad_threshold":0.05}"#).unwrap();
        assert_eq!(old.input_device.as_deref(), Some("mic"));
        assert_eq!(old.vad_threshold, Some(0.05));
        assert!(old.voice_mode.is_none());
        assert!(old.ptt_key.is_none());
    }

    #[test]
    fn stored_voice_settings_round_trips_full_payload() {
        let s = StoredVoiceSettings {
            input_device: Some("USB Mic".to_string()),
            output_device: Some("Speakers".to_string()),
            vad_threshold: Some(0.02),
            voice_mode: Some("ptt".to_string()),
            ptt_key: Some("Space".to_string()),
        };
        let json = serde_json::to_string(&s).unwrap();
        let back: StoredVoiceSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.input_device, s.input_device);
        assert_eq!(back.output_device, s.output_device);
        assert_eq!(back.vad_threshold, s.vad_threshold);
        assert_eq!(back.voice_mode, s.voice_mode);
        assert_eq!(back.ptt_key, s.ptt_key);
    }

    #[test]
    fn local_profile_decodes_with_missing_theme() {
        // Old prefs files predate the theme field; theme should default to None.
        let old: LocalProfile = serde_json::from_str(r#"{"profiles":[]}"#).unwrap();
        assert!(old.profiles.is_empty());
        assert!(old.theme.is_none());
        assert!(old.default_profile_id.is_none());
    }
}
