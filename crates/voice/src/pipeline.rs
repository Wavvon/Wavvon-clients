use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::RwLock as TokioRwLock;

use anyhow::Result;
use ringbuf::traits::{Consumer, Producer, Split};
use ringbuf::HeapRb;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use crate::capture::AudioCapture;
use crate::codec::{self, EffectiveVoiceConfig, VoiceDecoder, VoiceEncoder};
use crate::denoise::Denoiser;
use crate::playback::AudioPlayback;
use crate::protocol::{ReceivedVoicePacket, RING_BUFFER_SIZE};
use crate::soundboard::ActiveClip;
use crate::transport::VoiceTransport;

/// Default threshold for the RMS voice activity detector. Values in [0, 1].
/// 0.02 picks up normal speech at typical mic gain while ignoring fan/room noise.
pub const DEFAULT_VAD_THRESHOLD: f32 = 0.02;

/// How long we must stay below threshold before declaring "stopped speaking".
/// Prevents flickering on consonant gaps.
const VAD_RELEASE_MS: u64 = 250;

/// How long the receive task sleeps between polls while waiting for the
/// WebTransport session to come up (set once `voice_joined` delivers the
/// URL/token and the connect task finishes its QUIC handshake).
const TRANSPORT_POLL_MS: u64 = 100;

/// Audio quality profile selection.
#[derive(Clone, Debug, Default)]
pub enum AudioProfile {
    /// Speech-optimised (Voip application, mono, denoiser on, VAD on).
    #[default]
    Standard,
    /// Full-range audio (Audio application, stereo 128 kbps, denoiser/VAD off).
    Music,
    /// All parameters configurable via the custom_* fields on VoiceSettings.
    Custom,
}

/// Configuration the client can tune in its settings UI.
#[derive(Clone, Debug, Default)]
pub struct VoiceSettings {
    pub input_device: Option<String>,
    pub output_device: Option<String>,
    /// VAD threshold override used in Standard and Custom profiles.
    /// None uses DEFAULT_VAD_THRESHOLD.
    pub vad_threshold: Option<f32>,
    /// Active audio profile.
    pub audio_profile: AudioProfile,
    // Custom profile overrides — only used when audio_profile = Custom.
    pub custom_bitrate: Option<u32>,
    pub custom_app: Option<String>,
    pub custom_noise_suppress: Option<bool>,
    pub custom_vad: Option<bool>,
    pub custom_vad_threshold: Option<f32>,
    pub custom_channels: Option<u16>,
    pub custom_frame_ms: Option<u32>,
    pub custom_complexity: Option<u32>,
}

impl VoiceSettings {
    /// Resolve the active profile into a flat `EffectiveVoiceConfig`.
    pub fn effective_config(&self) -> EffectiveVoiceConfig {
        match self.audio_profile {
            AudioProfile::Standard => EffectiveVoiceConfig {
                vad_threshold: self.vad_threshold.unwrap_or(DEFAULT_VAD_THRESHOLD),
                ..EffectiveVoiceConfig::default()
            },
            AudioProfile::Music => EffectiveVoiceConfig {
                opus_app: audiopus::Application::Audio,
                bitrate: Some(128),
                channels: audiopus::Channels::Stereo,
                frame_duration_ms: 20,
                complexity: 9,
                noise_suppress: false,
                vad_enabled: false,
                vad_threshold: DEFAULT_VAD_THRESHOLD,
            },
            AudioProfile::Custom => EffectiveVoiceConfig {
                opus_app: match self.custom_app.as_deref() {
                    Some("audio") => audiopus::Application::Audio,
                    Some("lowdelay") => audiopus::Application::LowDelay,
                    _ => audiopus::Application::Voip,
                },
                bitrate: self.custom_bitrate,
                channels: if self.custom_channels == Some(2) {
                    audiopus::Channels::Stereo
                } else {
                    audiopus::Channels::Mono
                },
                frame_duration_ms: self.custom_frame_ms.unwrap_or(20),
                complexity: self.custom_complexity.unwrap_or(5),
                noise_suppress: self.custom_noise_suppress.unwrap_or(true),
                vad_enabled: self.custom_vad.unwrap_or(true),
                vad_threshold: self
                    .custom_vad_threshold
                    .or(self.vad_threshold)
                    .unwrap_or(DEFAULT_VAD_THRESHOLD),
            },
        }
    }
}

// ---------------------------------------------------------------------------
// Voice-transport v2 key state (docs/docs/voice-transport-v2.md)
// ---------------------------------------------------------------------------

/// One sender-key generation: the 32-byte AES key, its 4-byte nonce salt,
/// and its `key_id` generation counter. `Copy` -- this is small and passed
/// around by value between the WS layer (which owns key distribution) and
/// the pipeline (which only seals/opens packets with it).
#[derive(Clone, Copy, Debug)]
pub struct SenderKeyGen {
    pub sender_key: [u8; 32],
    pub nonce_salt: [u8; 4],
    pub key_id: u32,
}

/// Shared voice-key state for a running voice session. Keyed by pubkey (not
/// `sender_id` -- a roster slot is per-join, pubkey is the stable identity
/// the key belongs to); the send task only ever needs `own`, the receive
/// task resolves `sender_id -> pubkey` via the existing roster map before
/// looking a remote key up here.
///
/// Owned behind a single `Arc<RwLock<VoiceKeys>>` shared between the pipeline
/// and the desktop shell's WS/key-distribution code
/// (`apps/desktop/src-tauri/src/voice_keys.rs`), which populates `own` on
/// join/rotate and `remote` on `voice_key_received`.
pub struct VoiceKeys {
    /// My own current sending key. `None` until the WS layer generates one
    /// (voice-transport-v2.md: joiner generates key_id=1 on join).
    pub own: Option<SenderKeyGen>,
    /// My own per-key monotonic packet counter. An atomic so the hot send
    /// path only needs a *read* lock on the outer `RwLock<VoiceKeys>`.
    own_ctr: AtomicU64,
    /// pubkey -> up to 2 known generations (spec: "keep the last 2
    /// generations per sender to ride out rotation races").
    remote: HashMap<String, Vec<SenderKeyGen>>,
    /// Replay guard: `(sender_id, key_id) -> highest ctr seen`.
    watermarks: HashMap<(u16, u32), u64>,
}

impl Default for VoiceKeys {
    fn default() -> Self {
        Self::new()
    }
}

impl VoiceKeys {
    pub fn new() -> Self {
        Self {
            own: None,
            own_ctr: AtomicU64::new(0),
            remote: HashMap::new(),
            watermarks: HashMap::new(),
        }
    }

    /// Sets/rotates our own sending key, resetting the packet counter for
    /// the new generation.
    pub fn set_own(&mut self, gen: SenderKeyGen) {
        self.own = Some(gen);
        self.own_ctr.store(0, Ordering::Relaxed);
    }

    /// Allocates the next packet counter for our own key. Interior
    /// mutability (atomic) so the send task only needs a read lock.
    pub fn next_ctr(&self) -> u64 {
        self.own_ctr.fetch_add(1, Ordering::Relaxed)
    }

    /// Records a remote sender's key generation, keeping at most the last 2
    /// per sender.
    pub fn insert_remote(&mut self, pubkey: &str, gen: SenderKeyGen) {
        let gens = self.remote.entry(pubkey.to_string()).or_default();
        gens.retain(|g| g.key_id != gen.key_id);
        gens.push(gen);
        if gens.len() > 2 {
            gens.remove(0);
        }
    }

    /// Looks up a remote sender's key generation by `key_id`. `None` means
    /// "unknown (sender, key_id)" -- the caller drops the packet (spec).
    pub fn find_remote(&self, pubkey: &str, key_id: u32) -> Option<SenderKeyGen> {
        self.remote
            .get(pubkey)?
            .iter()
            .find(|g| g.key_id == key_id)
            .copied()
    }

    /// Replay guard: per-`(sender_id, key_id)` highest-`ctr` watermark.
    /// Returns `true` (and advances the watermark) when `ctr` is newer than
    /// anything seen for this key; `false` for at-or-below (drop).
    ///
    /// ponytail: a single watermark, not a sliding-window bitmap -- the spec
    /// explicitly accepts this ("small reorder window allowed"); upgrade to
    /// a bitmap if real-network reordering turns out to matter in practice.
    pub fn check_replay(&mut self, sender_id: u16, key_id: u32, ctr: u64) -> bool {
        let key = (sender_id, key_id);
        match self.watermarks.get(&key) {
            Some(&max_seen) if ctr <= max_seen => false,
            _ => {
                self.watermarks.insert(key, ctr);
                true
            }
        }
    }
}

/// Inbound voice loss for one sender, folded from the packet counter.
///
/// The counter is the sender's own monotonic sequence and sits in the
/// cleartext header, so gaps are visible without decrypting anything.
/// Out-of-order and replayed packets count as received but never move the
/// high-water mark backwards — reordering is not loss on a datagram path, and
/// treating it as loss is how a healthy call reads as a broken one.
///
/// Mirrors the web client's `connectionStats.ts` deliberately: the same
/// number under the same name on both clients, or the two answer the same
/// question differently.
#[derive(Debug, Clone, Copy)]
pub struct LossTracker {
    highest_ctr: u64,
    first_ctr: u64,
    received: u64,
}

impl LossTracker {
    pub fn first(ctr: u64) -> Self {
        Self {
            highest_ctr: ctr,
            first_ctr: ctr,
            received: 1,
        }
    }

    pub fn track(&mut self, ctr: u64) {
        self.highest_ctr = self.highest_ctr.max(ctr);
        self.first_ctr = self.first_ctr.min(ctr);
        self.received += 1;
    }

    /// Loss as a percentage, or `None` until there is a span to judge.
    ///
    /// Expected comes from the counter span rather than from elapsed time: a
    /// sender who is simply silent sends nothing, and time-based arithmetic
    /// would report that silence as total loss.
    pub fn percent(&self) -> Option<f32> {
        let expected = self.highest_ctr.saturating_sub(self.first_ctr) + 1;
        if expected <= 1 {
            return None;
        }
        let lost = expected.saturating_sub(self.received);
        Some(((lost as f32 / expected as f32) * 1000.0).round() / 10.0)
    }
}

fn resolve_opus_rate(device_rate: u32) -> u32 {
    match device_rate {
        8000 | 12000 | 16000 | 24000 | 48000 => device_rate,
        _ => {
            tracing::warn!("Device rate {device_rate} Hz not supported by Opus, using 48000 Hz");
            48000
        }
    }
}

pub struct AudioPipeline {
    _capture: AudioCapture,
    _playback: AudioPlayback,
    tasks: Vec<JoinHandle<()>>,
    /// Receives `true` when voice activity starts, `false` when it ends.
    /// Available on pipelines started with `start_p2p` / `start_loopback_*`.
    pub speaking_rx: Option<mpsc::UnboundedReceiver<bool>>,
    /// Receives the post-denoise RMS level of each captured frame (decimated
    /// to ~20 Hz). Range is roughly 0..0.3 for normal speech.
    pub level_rx: Option<mpsc::UnboundedReceiver<f32>>,
    /// Receives `(sender_id, is_whisper)` events when a sender's whisper state
    /// transitions. `true` = whisper packets started arriving; `false` = stopped.
    /// Available on pipelines started with `start_p2p` / `start_p2p_with_settings`.
    pub whisper_rx: Option<mpsc::UnboundedReceiver<(u16, bool)>>,
    /// When set, the send task drops outbound packets before they hit the
    /// socket. Capture and VAD continue so the user still sees their level.
    pub muted: Arc<AtomicBool>,
    /// When set, the receive task drops decoded frames instead of pushing
    /// them into playback. We don't stop reading the transport -- packets
    /// would otherwise just accumulate in kernel/QUIC buffers either way;
    /// doing it explicitly keeps the rest of the pipeline calm.
    pub deafened: Arc<AtomicBool>,
    /// Per-sender gain map: sender_id → gain multiplier [0.0, 2.0], default 1.0.
    /// Shared with the pipeline's receive task; update to control each speaker's volume.
    pub gain_map: Arc<TokioRwLock<HashMap<u16, f32>>>,
    /// Roster map: sender_id → pubkey. Updated by the Tauri WS handler on voice_roster_update.
    pub roster_map: Arc<TokioRwLock<HashMap<u16, String>>>,
    /// Per-sender inbound loss, folded from the cleartext `ctr` of every
    /// packet that opened and decoded. Read by the shell for the connection
    /// readout; empty until something has actually been heard.
    pub inbound_loss: Arc<TokioRwLock<HashMap<u16, LossTracker>>>,
    /// The WebTransport voice session. `None` until the WS layer's
    /// `voice_joined` handler connects it (voice-transport-v2.md) -- mirrors
    /// the old `udp_reg_token` hand-off point, but here the value itself is
    /// the live, already-connected session rather than a token to poll with.
    pub transport: Arc<TokioRwLock<Option<Arc<VoiceTransport>>>>,
    /// E2E voice-key state (own sending key + known remote keys + replay
    /// watermarks). Populated by the desktop shell's key-distribution code.
    pub voice_keys: Arc<TokioRwLock<VoiceKeys>>,
    /// Soundboard clip currently being mixed into the outbound stream, if
    /// any (soundboard.md §1). `None` = nothing playing. Set this to `Some`
    /// with samples already resampled to `opus_rate` -- the send task mixes
    /// it in once per captured frame, ahead of Opus encoding, and clears it
    /// back to `None` when the clip drains. Only one clip at a time: a new
    /// clip replaces whatever's still playing rather than queuing.
    pub active_clip: Arc<Mutex<Option<ActiveClip>>>,
    /// The sample rate the send task's frames are captured/encoded at.
    /// Callers must resample a decoded clip (always 48 kHz PCM) to this
    /// rate before storing it in `active_clip`.
    pub opus_rate: u32,
}

impl AudioPipeline {
    pub async fn start_loopback() -> Result<Self> {
        Self::start_loopback_with_settings(VoiceSettings::default()).await
    }

    pub async fn start_loopback_with_settings(settings: VoiceSettings) -> Result<Self> {
        let capture_rb = HeapRb::<f32>::new(RING_BUFFER_SIZE);
        let (capture_prod, mut capture_cons) = capture_rb.split();

        let playback_rb = HeapRb::<f32>::new(RING_BUFFER_SIZE);
        let (mut playback_prod, playback_cons) = playback_rb.split();

        let capture =
            AudioCapture::start_with_device(capture_prod, settings.input_device.as_deref())?;
        let playback =
            AudioPlayback::start_with_device(playback_cons, settings.output_device.as_deref())?;

        let cfg = EffectiveVoiceConfig::default();
        let opus_rate = resolve_opus_rate(capture.actual_sample_rate);
        let frame_size = codec::frame_size_for_rate_and_ms(opus_rate, cfg.frame_duration_ms);
        let (level_tx, level_rx) = mpsc::unbounded_channel::<f32>();

        let task = tokio::spawn(async move {
            let mut encoder = match VoiceEncoder::new(opus_rate, &cfg) {
                Ok(e) => e,
                Err(err) => {
                    tracing::error!(error = %err, "Loopback: failed to create encoder, task exiting");
                    return;
                }
            };
            let mut decoder = match VoiceDecoder::new(opus_rate) {
                Ok(d) => d,
                Err(err) => {
                    tracing::error!(error = %err, "Loopback: failed to create decoder, task exiting");
                    return;
                }
            };
            let mut denoiser = Denoiser::new();
            denoiser.bypass = !cfg.noise_suppress;
            let mut read_buf = vec![0.0f32; frame_size];
            let mut interval = tokio::time::interval(Duration::from_millis(10));
            let mut level_tick: u32 = 0;

            loop {
                interval.tick().await;

                let count = capture_cons.pop_slice(&mut read_buf);
                if count == 0 {
                    continue;
                }

                // Denoise → encode → decode → playback
                let denoised = denoiser.process(&read_buf[..count]);

                level_tick = level_tick.wrapping_add(1);
                if level_tick.is_multiple_of(5) {
                    let _ = level_tx.send(rms_of(&denoised));
                }

                let packets = encoder.encode(&denoised);

                for packet in &packets {
                    match decoder.decode(packet) {
                        Ok(samples) => {
                            let _ = playback_prod.push_slice(samples);
                        }
                        Err(e) => {
                            tracing::warn!("Decode error: {e}");
                        }
                    }
                }
            }
        });

        Ok(Self {
            _capture: capture,
            _playback: playback,
            tasks: vec![task],
            speaking_rx: None,
            level_rx: Some(level_rx),
            whisper_rx: None,
            muted: Arc::new(AtomicBool::new(false)),
            deafened: Arc::new(AtomicBool::new(false)),
            gain_map: Arc::new(TokioRwLock::new(HashMap::new())),
            roster_map: Arc::new(TokioRwLock::new(HashMap::new())),
            inbound_loss: Arc::new(TokioRwLock::new(HashMap::new())),
            transport: Arc::new(TokioRwLock::new(None)),
            voice_keys: Arc::new(TokioRwLock::new(VoiceKeys::new())),
            active_clip: Arc::new(Mutex::new(None)),
            opus_rate,
        })
    }

    /// Voice-channel mode: capture → encode → seal → WebTransport datagram
    /// to the hub relay; hub relay datagram → open → decode → playback.
    /// The transport itself connects later, once the WS layer's
    /// `voice_joined` reply delivers the URL/token (see `Self::transport`).
    pub async fn start_p2p() -> Result<Self> {
        Self::start_p2p_with_settings(VoiceSettings::default()).await
    }

    pub async fn start_p2p_with_settings(settings: VoiceSettings) -> Result<Self> {
        let capture_rb = HeapRb::<f32>::new(RING_BUFFER_SIZE);
        let (capture_prod, mut capture_cons) = capture_rb.split();

        let playback_rb = HeapRb::<f32>::new(RING_BUFFER_SIZE);
        let (mut playback_prod, playback_cons) = playback_rb.split();

        let capture =
            AudioCapture::start_with_device(capture_prod, settings.input_device.as_deref())?;
        let playback =
            AudioPlayback::start_with_device(playback_cons, settings.output_device.as_deref())?;

        // Resolve the active profile once; all sub-tasks use the same snapshot.
        let cfg = settings.effective_config();

        let (level_tx, level_rx) = mpsc::unbounded_channel::<f32>();

        let opus_rate = resolve_opus_rate(capture.actual_sample_rate);
        let frame_size = codec::frame_size_for_rate_and_ms(opus_rate, cfg.frame_duration_ms);

        let transport: Arc<TokioRwLock<Option<Arc<VoiceTransport>>>> =
            Arc::new(TokioRwLock::new(None));

        let (speaking_tx, speaking_rx) = mpsc::unbounded_channel::<bool>();
        let (whisper_tx, whisper_rx) = mpsc::unbounded_channel::<(u16, bool)>();

        let muted = Arc::new(AtomicBool::new(false));
        let deafened = Arc::new(AtomicBool::new(false));

        let gain_map = Arc::new(TokioRwLock::new(HashMap::<u16, f32>::new()));
        let roster_map = Arc::new(TokioRwLock::new(HashMap::<u16, String>::new()));
        let inbound_loss = Arc::new(TokioRwLock::new(HashMap::<u16, LossTracker>::new()));
        let voice_keys = Arc::new(TokioRwLock::new(VoiceKeys::new()));

        let active_clip: Arc<Mutex<Option<ActiveClip>>> = Arc::new(Mutex::new(None));

        // Send task: capture → encode → seal → WebTransport, plus RMS-based VAD + level meter.
        let send_transport = transport.clone();
        let send_voice_keys = voice_keys.clone();
        let send_muted = muted.clone();
        let send_active_clip = active_clip.clone();
        let vad_enabled = cfg.vad_enabled;
        let vad_threshold = cfg.vad_threshold;
        let send_task = tokio::spawn(async move {
            let mut encoder = match VoiceEncoder::new(opus_rate, &cfg) {
                Ok(e) => e,
                Err(err) => {
                    tracing::error!(error = %err, "Voice send: failed to create encoder, task exiting");
                    return;
                }
            };
            let mut denoiser = Denoiser::new();
            denoiser.bypass = !cfg.noise_suppress;
            let mut read_buf = vec![0.0f32; frame_size];
            let mut interval = tokio::time::interval(Duration::from_millis(10));
            let mut timestamp: u32 = 0;

            let mut is_speaking = false;
            let mut last_active_at: Option<std::time::Instant> = None;
            let mut level_tick: u32 = 0;

            loop {
                interval.tick().await;

                let count = capture_cons.pop_slice(&mut read_buf);
                if count == 0 {
                    // Still fire a release even without new audio.
                    if is_speaking {
                        if let Some(last) = last_active_at {
                            if last.elapsed() > Duration::from_millis(VAD_RELEASE_MS) {
                                is_speaking = false;
                                let _ = speaking_tx.send(false);
                            }
                        }
                    }
                    continue;
                }

                let mut denoised = denoiser.process(&read_buf[..count]);

                // Mix in a playing soundboard clip *after* denoise (mixing
                // before would feed RNNoise a burst of clean synthetic audio
                // it might mistake for noise and suppress) and *before* Opus
                // encode, so the clip rides the caller's own outgoing
                // stream (soundboard.md §1) rather than only playing back
                // locally.
                {
                    let mut clip_slot = send_active_clip.lock().unwrap();
                    if let Some(clip) = clip_slot.as_mut() {
                        if crate::soundboard::mix_clip_into_frame(&mut denoised, clip) {
                            *clip_slot = None;
                        }
                    }
                }

                // Voice activity detection on post-denoise (+ clip-mixed) samples.
                let rms = rms_of(&denoised);

                // Decimate level emission to ~20 Hz (every 5 ticks of 10 ms).
                level_tick = level_tick.wrapping_add(1);
                if level_tick.is_multiple_of(5) {
                    let _ = level_tx.send(rms);
                }

                if vad_enabled {
                    if rms > vad_threshold {
                        last_active_at = Some(std::time::Instant::now());
                        if !is_speaking {
                            is_speaking = true;
                            let _ = speaking_tx.send(true);
                        }
                    } else if is_speaking {
                        if let Some(last) = last_active_at {
                            if last.elapsed() > Duration::from_millis(VAD_RELEASE_MS) {
                                is_speaking = false;
                                let _ = speaking_tx.send(false);
                            }
                        }
                    }
                } else {
                    // VAD disabled (e.g. Music profile): always transmit.
                    // Emit a single speaking=true on first audio; no release.
                    if !is_speaking {
                        is_speaking = true;
                        let _ = speaking_tx.send(true);
                    }
                }

                let packets = encoder.encode(&denoised);

                // While muted: keep the encoder in sync (so unmuting doesn't
                // pop) but drop the bytes before sealing/sending. VAD + level
                // already fired above so the local meter still pulses.
                //
                // Silence is suppressed the same way, which is what "drops
                // silence" in the voice settings has always promised and what
                // nothing here actually did: `vad_enabled` only chose how the
                // speaking indicator behaved, and every frame went out
                // regardless. The clip mix is summed into `denoised` before the
                // VAD above, so a playing soundboard clip holds `is_speaking`
                // and is not gated.
                let suppress = send_muted.load(Ordering::Relaxed) || (vad_enabled && !is_speaking);

                for opus_data in packets {
                    if !suppress {
                        let own_gen = send_voice_keys.read().await.own;
                        if let Some(gen) = own_gen {
                            let ctr = send_voice_keys.read().await.next_ctr();
                            let sealed = crate::crypto::voice_packet_seal(
                                &gen.sender_key,
                                &gen.nonce_salt,
                                gen.key_id,
                                ctr,
                                timestamp,
                                &opus_data,
                            );
                            let conn = send_transport.read().await.clone();
                            if let Some(conn) = conn {
                                if let Err(e) = conn.send_datagram(&sealed) {
                                    tracing::warn!("Voice WT send error: {e}");
                                }
                            }
                            // Else: no session yet (still connecting) --
                            // drop, same as muted. No queue: voice is
                            // unreliable/unordered by design.
                        }
                        // Else: no sender key yet (still joining) -- drop.
                    }
                    timestamp = timestamp.wrapping_add(frame_size as u32);
                }
            }
        });

        // Receive task: WebTransport → deserialize relay prefix → resolve
        // sender's current key by key_id → open → decode → playback
        // (per-sender decoder + gain + whisper state). Unknown senders,
        // unknown (sender, key_id) pairs, and replayed counters are dropped
        // (voice-transport-v2.md).
        let recv_transport = transport.clone();
        let recv_voice_keys = voice_keys.clone();
        let recv_roster = roster_map.clone();
        let recv_inbound_loss = inbound_loss.clone();
        let recv_deafened = deafened.clone();
        let recv_gain_map = gain_map.clone();
        let recv_task = tokio::spawn(async move {
            // Per-sender decoder map: sender_id → VoiceDecoder
            let mut decoders: HashMap<u16, VoiceDecoder> = HashMap::new();
            // Per-sender whisper state: sender_id → currently_whispering
            let mut whisper_state: HashMap<u16, bool> = HashMap::new();

            loop {
                let conn = recv_transport.read().await.clone();
                let Some(conn) = conn else {
                    // Not connected yet (voice_joined hasn't landed, or the
                    // QUIC handshake is still in flight) -- poll.
                    tokio::time::sleep(Duration::from_millis(TRANSPORT_POLL_MS)).await;
                    continue;
                };

                let raw = match conn.recv_datagram().await {
                    Ok(raw) => raw,
                    Err(e) => {
                        tracing::warn!("Voice WT recv error: {e}");
                        tokio::time::sleep(Duration::from_millis(TRANSPORT_POLL_MS)).await;
                        continue;
                    }
                };

                let packet = match ReceivedVoicePacket::deserialize(&raw) {
                    Ok(p) => p,
                    Err(_) => continue,
                };

                // Track whisper state transitions before checking deafened,
                // so indicators update even when deafened.
                let is_whisper = packet.is_whisper();
                let was_whispering = whisper_state
                    .get(&packet.sender_id)
                    .copied()
                    .unwrap_or(false);
                if is_whisper != was_whispering {
                    whisper_state.insert(packet.sender_id, is_whisper);
                    let _ = whisper_tx.send((packet.sender_id, is_whisper));
                }

                if recv_deafened.load(Ordering::Relaxed) {
                    continue;
                }

                let Some((key_id, ctr, _ts)) = crate::crypto::peek_header(&packet.sealed) else {
                    continue;
                };

                let pubkey = {
                    let rm = recv_roster.read().await;
                    rm.get(&packet.sender_id).cloned()
                };
                let Some(pubkey) = pubkey else {
                    // Unknown sender_id: no roster entry yet. Drop.
                    continue;
                };

                let gen = {
                    let mut vk = recv_voice_keys.write().await;
                    if !vk.check_replay(packet.sender_id, key_id, ctr) {
                        None
                    } else {
                        vk.find_remote(&pubkey, key_id)
                    }
                };
                let Some(gen) = gen else {
                    // Replayed, or unknown (sender, key_id) -- drop per spec.
                    continue;
                };

                let opus_data = match crate::crypto::voice_packet_open(
                    &gen.sender_key,
                    &gen.nonce_salt,
                    &packet.sealed,
                ) {
                    Ok((_, _, _, opus)) => {
                        // Counted here and nowhere earlier: a packet that
                        // failed to open is not a packet this sender sent us,
                        // and counting it would make a wrong key look like a
                        // clean line.
                        let mut loss = recv_inbound_loss.write().await;
                        loss.entry(packet.sender_id)
                            .and_modify(|t| t.track(ctr))
                            .or_insert_with(|| LossTracker::first(ctr));
                        opus
                    }
                    Err(e) => {
                        tracing::warn!(
                            sender_id = packet.sender_id,
                            error = %e,
                            "Voice packet decrypt failed, dropping"
                        );
                        continue;
                    }
                };

                // Get or create a decoder for this sender. If decoder
                // construction fails (e.g. bad opus_rate), skip this packet
                // rather than panicking inside the receive task.
                let decoder = match decoders.entry(packet.sender_id) {
                    std::collections::hash_map::Entry::Occupied(e) => e.into_mut(),
                    std::collections::hash_map::Entry::Vacant(e) => {
                        match VoiceDecoder::new(opus_rate) {
                            Ok(d) => e.insert(d),
                            Err(err) => {
                                tracing::warn!(
                                    sender_id = packet.sender_id,
                                    error = %err,
                                    "Failed to create decoder for sender, dropping packet"
                                );
                                continue;
                            }
                        }
                    }
                };

                match decoder.decode(&opus_data) {
                    Ok(samples) => {
                        // Apply per-sender gain
                        let gain = {
                            let gm = recv_gain_map.read().await;
                            *gm.get(&packet.sender_id).unwrap_or(&1.0f32)
                        };
                        if gain == 0.0 {
                            // Fully muted: skip
                        } else if (gain - 1.0f32).abs() < 0.001 {
                            // Unity gain: push as-is
                            let _ = playback_prod.push_slice(samples);
                        } else {
                            // Apply gain
                            let gained: Vec<f32> = samples
                                .iter()
                                .map(|s| (s * gain).clamp(-1.0, 1.0))
                                .collect();
                            let _ = playback_prod.push_slice(&gained);
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Decode error from sender {}: {e}", packet.sender_id);
                    }
                }
            }
        });

        tracing::info!("Voice pipeline started (WebTransport pending voice_joined)");

        Ok(Self {
            _capture: capture,
            _playback: playback,
            tasks: vec![send_task, recv_task],
            speaking_rx: Some(speaking_rx),
            level_rx: Some(level_rx),
            whisper_rx: Some(whisper_rx),
            muted,
            deafened,
            gain_map,
            roster_map,
            inbound_loss,
            transport,
            voice_keys,
            active_clip,
            opus_rate,
        })
    }

    pub async fn stop(self) {
        for task in self.tasks {
            task.abort();
        }
    }
}

fn rms_of(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
    (sum_sq / samples.len() as f32).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replay_guard_accepts_first_packet_at_ctr_zero() {
        let mut keys = VoiceKeys::new();
        assert!(keys.check_replay(1, 99, 0));
    }

    #[test]
    fn replay_guard_accepts_strictly_increasing_ctr() {
        let mut keys = VoiceKeys::new();
        assert!(keys.check_replay(1, 99, 0));
        assert!(keys.check_replay(1, 99, 1));
        assert!(keys.check_replay(1, 99, 5));
    }

    #[test]
    fn replay_guard_rejects_at_or_below_watermark() {
        let mut keys = VoiceKeys::new();
        assert!(keys.check_replay(1, 99, 5));
        assert!(!keys.check_replay(1, 99, 5)); // replay of the same ctr
        assert!(!keys.check_replay(1, 99, 3)); // reorder past the window
    }

    #[test]
    fn replay_guard_watermarks_are_independent_per_sender_and_key_id() {
        let mut keys = VoiceKeys::new();
        assert!(keys.check_replay(1, 99, 5));
        // Different sender_id: independent watermark.
        assert!(keys.check_replay(2, 99, 0));
        // Same sender, rotated key_id: independent watermark (a rotation
        // race must not lock the new generation out).
        assert!(keys.check_replay(1, 100, 0));
    }

    #[test]
    fn remote_keys_keep_only_last_two_generations() {
        let mut keys = VoiceKeys::new();
        let gen = |key_id| SenderKeyGen {
            sender_key: [0u8; 32],
            nonce_salt: [0u8; 4],
            key_id,
        };
        keys.insert_remote("pk1", gen(1));
        keys.insert_remote("pk1", gen(2));
        keys.insert_remote("pk1", gen(3));
        assert!(keys.find_remote("pk1", 1).is_none());
        assert!(keys.find_remote("pk1", 2).is_some());
        assert!(keys.find_remote("pk1", 3).is_some());
    }
}

#[cfg(test)]
mod loss_tests {
    use super::LossTracker;

    #[test]
    fn one_packet_is_not_enough_to_judge() {
        assert_eq!(LossTracker::first(0).percent(), None);
    }

    #[test]
    fn a_clean_run_is_zero_and_a_gap_is_counted() {
        let mut t = LossTracker::first(0);
        for ctr in 1..=9 {
            t.track(ctr);
        }
        assert_eq!(t.percent(), Some(0.0));

        // 10 sent, one of them never arrived.
        let mut gappy = LossTracker::first(0);
        for ctr in [1, 2, 3, 4, 6, 7, 8, 9] {
            gappy.track(ctr);
        }
        assert_eq!(gappy.percent(), Some(10.0));
    }

    #[test]
    fn reordering_is_not_loss() {
        // The same ten packets, delivered out of order. A tracker that let the
        // high-water mark move backwards would report loss on a clean line.
        let mut t = LossTracker::first(3);
        for ctr in [1, 0, 2, 5, 4, 9, 6, 8, 7] {
            t.track(ctr);
        }
        assert_eq!(t.percent(), Some(0.0));
    }
}
