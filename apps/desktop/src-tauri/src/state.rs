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

/// Latency samples kept for the rolling figures, one every two seconds.
/// A twenty-second window: long enough to be steady, short enough to react.
pub(crate) const RTT_WINDOW: usize = 10;

/// What the connection readout shows, per hub, as its socket measures it.
///
/// Deliberately the same two numbers under the same names as the web
/// client's `connectionStats.ts` — median round trip with its mean absolute
/// deviation — because two clients answering "how is my connection" with
/// differently-computed numbers is worse than one client not answering.
#[derive(Default)]
pub(crate) struct ConnStats {
    /// Round-trip samples in milliseconds, oldest first.
    pub rtt_samples: Vec<u32>,
    /// The relay's outbound-loss figure from the most recent pong.
    pub outbound_loss_pct: Option<f32>,
}

impl ConnStats {
    pub fn push_sample(&mut self, ms: u32) {
        self.rtt_samples.push(ms);
        if self.rtt_samples.len() > RTT_WINDOW {
            self.rtt_samples.remove(0);
        }
    }

    /// Median, and the mean absolute deviation around it.
    ///
    /// Median rather than mean, and MAD rather than standard deviation: one
    /// stalled probe on a flaky link should not move the headline number, and
    /// squaring the outlier the median just ignored would put it back.
    pub fn rtt(&self) -> (Option<u32>, Option<f32>, usize) {
        if self.rtt_samples.is_empty() {
            return (None, None, 0);
        }
        let mut sorted = self.rtt_samples.clone();
        sorted.sort_unstable();
        let mid = sorted.len() / 2;
        let median = if sorted.len() % 2 == 0 {
            (sorted[mid - 1] as f32 + sorted[mid] as f32) / 2.0
        } else {
            sorted[mid] as f32
        };
        if sorted.len() == 1 {
            return (Some(median.round() as u32), None, 1);
        }
        let mad = self
            .rtt_samples
            .iter()
            .map(|s| (*s as f32 - median).abs())
            .sum::<f32>()
            / self.rtt_samples.len() as f32;
        (
            Some(median.round() as u32),
            Some((mad * 10.0).round() / 10.0),
            self.rtt_samples.len(),
        )
    }
}

pub(crate) struct AppState {
    /// Live hub sessions keyed by hub_id (the hub's public_key).
    pub hubs: Mutex<HashMap<String, HubSession>>,
    /// Connection figures per hub_id, written by that hub's socket task.
    pub conn_stats: Mutex<HashMap<String, ConnStats>>,
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
    /// The identity this hub attributes our actions to, as /auth/verify
    /// reported it. Not always this device's own pubkey: an entropy-holding
    /// identity presents a self-signed cert at auth, and a hub that has never
    /// seen it before seats the *master* as the user (the hub's
    /// resolve_canonical_identity). Everything the hub verifies — a DM
    /// envelope's signature, the owner of a published DH key — is checked
    /// against this, so it is what we sign and claim as.
    pub canonical_pubkey: String,
    pub ws_tx: mpsc::UnboundedSender<WsCommand>,
    pub ws_task: JoinHandle<()>,
}

pub(crate) enum WsCommand {
    Subscribe(String),
    Unsubscribe(String),
    VoiceJoin {
        channel_id: String,
    },
    VoiceLeave {
        channel_id: String,
    },
    VoiceSpeaking {
        channel_id: String,
        speaking: bool,
    },
    /// V4 voice encryption (voice-transport-v2.md): our sender-key bundles
    /// for one or more recipients in `channel_id`.
    VoiceKeyOffer {
        channel_id: String,
        bundles: Vec<crate::types::VoiceKeyBundleInfo>,
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
    /// sender_id → inbound loss, folded by the pipeline's receive task from
    /// every packet that opened and decoded. What the connection readout
    /// shows, and the only thing in the app that says whether voice is
    /// actually arriving.
    pub inbound_loss:
        std::sync::Arc<tokio::sync::RwLock<HashMap<u16, wavvon_voice::pipeline::LossTracker>>>,
    /// Active voice zones: zone_id → ZoneInfo
    pub voice_zones: std::sync::Arc<std::sync::Mutex<HashMap<String, ZoneInfo>>>,
    /// My own position per zone: zone_id → Vec<f64>
    pub my_position: std::sync::Arc<std::sync::Mutex<HashMap<String, Vec<f64>>>>,
    /// The WebTransport voice session. Set by the ws task's `voice_joined`
    /// handler, which spawns the QUIC connect against `voice_wt_url` once
    /// the hub hands over the URL/token (voice-transport-v2.md).
    pub transport: std::sync::Arc<
        tokio::sync::RwLock<Option<std::sync::Arc<wavvon_voice::transport::VoiceTransport>>>,
    >,
    /// E2E voice-key state shared with the audio pipeline (own sending key
    /// + known remote keys + replay watermarks).
    pub voice_keys: std::sync::Arc<tokio::sync::RwLock<wavvon_voice::VoiceKeys>>,
    /// Shared with the audio pipeline's send task -- set by
    /// `soundboard_play_clip` to mix a decoded clip into the outbound
    /// stream (soundboard.md §1).
    pub active_clip: std::sync::Arc<std::sync::Mutex<Option<wavvon_voice::soundboard::ActiveClip>>>,
    /// The pipeline's capture/encode sample rate -- a clip must be
    /// resampled to this rate before being placed in `active_clip`.
    pub opus_rate: u32,
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

/// The canonical pubkey of the active session, if a hub has told us one.
pub(crate) fn active_canonical_pubkey(state: &AppState) -> Option<String> {
    let active_id = state.active_hub.lock().unwrap().clone()?;
    let hubs = state.hubs.lock().unwrap();
    hubs.get(&active_id).map(|s| s.canonical_pubkey.clone())
}

/// The canonical pubkey for one hub URL, if a session for it exists.
pub(crate) fn canonical_for_url(state: &AppState, hub_url: &str) -> Option<String> {
    let normalized = hub_url.trim_end_matches('/').to_string();
    let hubs = state.hubs.lock().unwrap();
    hubs.values()
        .find(|s| s.hub_url.trim_end_matches('/') == normalized)
        .map(|s| s.canonical_pubkey.clone())
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
