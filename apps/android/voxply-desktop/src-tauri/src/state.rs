use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

// --- Shared state ---

pub(crate) struct AppState {
    /// Live hub sessions keyed by hub_id (the hub's public_key).
    pub(crate) hubs: Mutex<HashMap<String, HubSession>>,
    /// Currently active hub_id (what the UI is showing).
    pub(crate) active_hub: Mutex<Option<String>>,
    /// Voice session (only one at a time across all hubs).
    pub(crate) voice: Mutex<Option<VoiceSession>>,
    pub(crate) http_client: reqwest::Client,
}

pub(crate) struct HubSession {
    pub(crate) hub_id: String,
    pub(crate) hub_name: String,
    pub(crate) hub_url: String,
    pub(crate) hub_icon: Option<String>,
    pub(crate) token: String,
    pub(crate) ws_tx: mpsc::UnboundedSender<WsCommand>,
    pub(crate) ws_task: JoinHandle<()>,
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
}

pub(crate) struct PendingDeepLink {
    pub(crate) url: std::sync::Mutex<Option<String>>,
}

pub(crate) struct VoiceSession {
    pub(crate) channel_id: String,
    pub(crate) hub_id: String,
    pub(crate) stop_tx: std::sync::mpsc::Sender<()>,
    /// Self-mute / self-deafen flags shared with the audio pipeline. Setting
    /// either flips behavior in the running send/recv tasks without going
    /// through a control channel.
    pub(crate) muted: std::sync::Arc<std::sync::atomic::AtomicBool>,
    pub(crate) deafened: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
pub(crate) struct StoredVoiceSettings {
    pub(crate) input_device: Option<String>,
    pub(crate) output_device: Option<String>,
    /// Range [0.001, 0.2]. Higher = less sensitive.
    pub(crate) vad_threshold: Option<f32>,
    /// "vad" (default) or "ptt". In PTT mode the mic is muted at rest and
    /// only opens while the configured key is held down.
    #[serde(default)]
    pub(crate) voice_mode: Option<String>,
    /// KeyboardEvent.code of the PTT hotkey (e.g. "Space", "ControlLeft").
    /// Stored as a layout-independent code so it survives keyboard switches.
    #[serde(default)]
    pub(crate) ptt_key: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct AudioDeviceList {
    pub(crate) inputs: Vec<String>,
    pub(crate) outputs: Vec<String>,
}

/// Response from /info endpoint.
#[derive(Serialize, Deserialize)]
pub(crate) struct InfoResponse {
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) description: Option<String>,
    #[serde(default)]
    pub(crate) icon: Option<String>,
    pub(crate) public_key: String,
    #[serde(default)]
    pub(crate) farm_url: Option<String>,
}

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
