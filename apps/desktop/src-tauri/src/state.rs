use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

// ---------------------------------------------------------------------------
// Voice roster type alias
// ---------------------------------------------------------------------------

pub(crate) type VoiceRosterMaps = Option<(
    std::sync::Arc<tokio::sync::RwLock<HashMap<u16, f32>>>,
    std::sync::Arc<tokio::sync::RwLock<HashMap<u16, String>>>,
)>;

// ---------------------------------------------------------------------------
// Shared application state
// ---------------------------------------------------------------------------

pub(crate) struct AppState {
    /// Live hub sessions keyed by hub_id (the hub's public_key).
    pub hubs: Mutex<HashMap<String, HubSession>>,
    /// Currently active hub_id (what the UI is showing).
    pub active_hub: Mutex<Option<String>>,
    /// Voice session (only one at a time across all hubs).
    pub voice: Mutex<Option<VoiceSession>>,
    pub http_client: reqwest::Client,
}

pub(crate) struct PendingUpdate(pub std::sync::Mutex<Option<tauri_plugin_updater::Update>>);

pub(crate) struct HubSession {
    pub hub_id: String,
    pub hub_name: String,
    pub hub_url: String,
    pub hub_icon: Option<String>,
    pub token: String,
    pub ws_tx: mpsc::UnboundedSender<WsCommand>,
    pub ws_task: JoinHandle<()>,
}

pub(crate) enum WsCommand {
    Subscribe(String),
    Unsubscribe(String),
    VoiceJoin {
        channel_id: String,
        udp_port: u16,
    },
    VoiceLeave {
        channel_id: String,
    },
    VoiceSpeaking {
        channel_id: String,
        speaking: bool,
    },
    Typing {
        channel_id: String,
        typing: bool,
    },
    DmTyping {
        conversation_id: String,
        typing: bool,
    },
    Raw(String),
}


#[derive(Clone, Debug)]
#[allow(dead_code)]
pub(crate) struct ZoneInfo {
    pub zone_id: String,
    pub coordinate_system: String,
    pub attenuation: crate::types::AttenuationConfigInfo,
    /// pubkey → position
    pub positions: HashMap<String, Vec<f64>>,
}

pub(crate) struct VoiceSession {
    pub channel_id: String,
    pub hub_id: String,
    pub stop_tx: std::sync::mpsc::Sender<()>,
    /// Self-mute / self-deafen flags shared with the audio pipeline. Setting
    /// either flips behavior in the running send/recv tasks without going
    /// through a control channel.
    pub muted: std::sync::Arc<std::sync::atomic::AtomicBool>,
    pub deafened: std::sync::Arc<std::sync::atomic::AtomicBool>,
    /// Shared with the audio pipeline's receive task.
    pub gain_map: std::sync::Arc<tokio::sync::RwLock<HashMap<u16, f32>>>,
    /// sender_id → pubkey, updated on voice_roster_update WS messages.
    pub roster_map: std::sync::Arc<tokio::sync::RwLock<HashMap<u16, String>>>,
    /// Active voice zones: zone_id → ZoneInfo
    pub voice_zones: std::sync::Arc<std::sync::Mutex<HashMap<String, ZoneInfo>>>,
    /// My own position per zone: zone_id → Vec<f64>
    pub my_position: std::sync::Arc<std::sync::Mutex<HashMap<String, Vec<f64>>>>,
    /// UDP source-address registration token (64-char hex). Set by the ws task
    /// when the hub sends a `voice_joined` message with `udp_register_token`.
    /// The registration loop (running in the voice thread) reads this to send
    /// VXRG packets until acked.
    pub udp_reg_token: std::sync::Arc<std::sync::Mutex<Option<String>>>,
}

// ---------------------------------------------------------------------------
// Session helpers (shared across command modules)
// ---------------------------------------------------------------------------

/// Get the active session details (hub_url, token) or error if no hub selected.
pub(crate) fn active_session(state: &AppState) -> Result<(String, String), String> {
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
pub(crate) fn session_for_url(state: &AppState, hub_url: &str) -> Result<String, String> {
    let normalized = hub_url.trim_end_matches('/').to_string();
    let hubs = state.hubs.lock().unwrap();
    hubs.values()
        .find(|s| s.hub_url.trim_end_matches('/') == normalized)
        .map(|s| s.token.clone())
        .ok_or_else(|| format!("No active session for hub: {hub_url}"))
}

/// Get the active session's WS sender.
pub(crate) fn active_ws_tx(state: &AppState) -> Result<mpsc::UnboundedSender<WsCommand>, String> {
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
