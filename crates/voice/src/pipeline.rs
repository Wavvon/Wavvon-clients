use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
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
use crate::protocol::{VoicePacket, RING_BUFFER_SIZE};
use crate::soundboard::ActiveClip;
use crate::transport::VoiceSocket;

/// Default threshold for the RMS voice activity detector. Values in [0, 1].
/// 0.02 picks up normal speech at typical mic gain while ignoring fan/room noise.
pub const DEFAULT_VAD_THRESHOLD: f32 = 0.02;

/// How long we must stay below threshold before declaring "stopped speaking".
/// Prevents flickering on consonant gaps.
const VAD_RELEASE_MS: u64 = 250;

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

pub struct AudioPipeline {
    _capture: AudioCapture,
    _playback: AudioPlayback,
    tasks: Vec<JoinHandle<()>>,
    pub local_udp_port: u16,
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
    /// them into playback. We don't stop reading the socket -- the OS UDP
    /// buffer would fill and packets would be dropped at the kernel layer
    /// either way; doing it explicitly keeps the rest of the pipeline calm.
    pub deafened: Arc<AtomicBool>,
    /// Per-sender gain map: sender_id → gain multiplier [0.0, 2.0], default 1.0.
    /// Shared with the pipeline's receive task; update to control each speaker's volume.
    pub gain_map: Arc<TokioRwLock<HashMap<u16, f32>>>,
    /// Roster map: sender_id → pubkey. Updated by the Tauri WS handler on voice_roster_update.
    pub roster_map: Arc<TokioRwLock<HashMap<u16, String>>>,
    /// UDP registration token (64 hex chars). When set, a registration loop
    /// sends b"VXRG" + token every 500 ms until the hub acks with b"VXRA".
    /// None means no registration required (older hub that does not send the field).
    pub udp_reg_token: Arc<Mutex<Option<String>>>,
    /// Set to true by the receive task when the hub replies with b"VXRA".
    pub udp_reg_acked: Arc<AtomicBool>,
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

fn resolve_opus_rate(device_rate: u32) -> u32 {
    match device_rate {
        8000 | 12000 | 16000 | 24000 | 48000 => device_rate,
        _ => {
            tracing::warn!("Device rate {device_rate} Hz not supported by Opus, using 48000 Hz");
            48000
        }
    }
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
            local_udp_port: 0,
            speaking_rx: None,
            level_rx: Some(level_rx),
            whisper_rx: None,
            muted: Arc::new(AtomicBool::new(false)),
            deafened: Arc::new(AtomicBool::new(false)),
            gain_map: Arc::new(TokioRwLock::new(HashMap::new())),
            roster_map: Arc::new(TokioRwLock::new(HashMap::new())),
            udp_reg_token: Arc::new(Mutex::new(None)),
            udp_reg_acked: Arc::new(AtomicBool::new(false)),
            active_clip: Arc::new(Mutex::new(None)),
            opus_rate,
        })
    }

    /// P2P mode: capture → encode → UDP send to remote,
    /// UDP recv from remote → decode → playback.
    pub async fn start_p2p(local_port: u16, remote_addr: SocketAddr) -> Result<Self> {
        Self::start_p2p_with_settings(local_port, remote_addr, VoiceSettings::default()).await
    }

    pub async fn start_p2p_with_settings(
        local_port: u16,
        remote_addr: SocketAddr,
        settings: VoiceSettings,
    ) -> Result<Self> {
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

        let mut socket = VoiceSocket::bind(local_port).await?;
        let actual_local_port = socket.local_addr()?.port();
        socket.set_remote(remote_addr);
        let socket = Arc::new(socket);

        let (speaking_tx, speaking_rx) = mpsc::unbounded_channel::<bool>();
        let (whisper_tx, whisper_rx) = mpsc::unbounded_channel::<(u16, bool)>();

        let muted = Arc::new(AtomicBool::new(false));
        let deafened = Arc::new(AtomicBool::new(false));

        let gain_map = Arc::new(TokioRwLock::new(HashMap::<u16, f32>::new()));
        let roster_map = Arc::new(TokioRwLock::new(HashMap::<u16, String>::new()));

        let udp_reg_token: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
        let udp_reg_acked = Arc::new(AtomicBool::new(false));

        let active_clip: Arc<Mutex<Option<ActiveClip>>> = Arc::new(Mutex::new(None));

        // Send task: capture → encode → UDP, plus RMS-based VAD + level meter
        let send_socket = socket.clone();
        let send_muted = muted.clone();
        let send_active_clip = active_clip.clone();
        let vad_enabled = cfg.vad_enabled;
        let vad_threshold = cfg.vad_threshold;
        let send_task = tokio::spawn(async move {
            let mut encoder = match VoiceEncoder::new(opus_rate, &cfg) {
                Ok(e) => e,
                Err(err) => {
                    tracing::error!(error = %err, "P2P send: failed to create encoder, task exiting");
                    return;
                }
            };
            let mut denoiser = Denoiser::new();
            denoiser.bypass = !cfg.noise_suppress;
            let mut read_buf = vec![0.0f32; frame_size];
            let mut interval = tokio::time::interval(Duration::from_millis(10));
            let mut sequence: u16 = 0;
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
                // pop) but drop the bytes before the socket. VAD + level
                // already fired above so the local meter still pulses.
                let suppress = send_muted.load(Ordering::Relaxed);

                for opus_data in packets {
                    if !suppress {
                        let packet = VoicePacket {
                            sequence,
                            timestamp,
                            opus_data,
                        };
                        if let Err(e) = send_socket.send(&packet).await {
                            tracing::warn!("UDP send error: {e}");
                        }
                    }
                    sequence = sequence.wrapping_add(1);
                    timestamp = timestamp.wrapping_add(frame_size as u32);
                }
            }
        });

        // Receive task: UDP → decode → playback (per-sender decoder + gain + whisper state).
        // Raw bytes are inspected first so the 4-byte VXRA registration ack is
        // recognised before handing data to the audio deserialiser.
        let recv_socket = socket.clone();
        let recv_deafened = deafened.clone();
        let recv_gain_map = gain_map.clone();
        let recv_acked = udp_reg_acked.clone();
        let recv_task = tokio::spawn(async move {
            // Per-sender decoder map: sender_id → VoiceDecoder
            let mut decoders: HashMap<u16, VoiceDecoder> = HashMap::new();
            // Per-sender whisper state: sender_id → currently_whispering
            let mut whisper_state: HashMap<u16, bool> = HashMap::new();

            loop {
                match recv_socket.recv_raw().await {
                    Ok((raw, _from)) => {
                        // 4-byte VXRA: registration ack from the hub.
                        if raw == b"VXRA" {
                            recv_acked.store(true, Ordering::Release);
                            tracing::info!("UDP registration ack (VXRA) received");
                            continue;
                        }

                        // Parse as an audio packet; packets shorter than 8 bytes
                        // are silently ignored (no log spam for stray datagrams).
                        let packet = match crate::protocol::ReceivedVoicePacket::deserialize(&raw) {
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

                        match decoder.decode(&packet.opus_data) {
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
                                tracing::warn!(
                                    "Decode error from sender {}: {e}",
                                    packet.sender_id
                                );
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!("UDP recv error: {e}");
                    }
                }
            }
        });

        // Registration loop: watches udp_reg_token; when a token is present and
        // not yet acked, sends b"VXRG" + token every 500 ms until acked or 30 s
        // elapses (matching the server-side token TTL).
        let reg_socket = socket.clone();
        let reg_token = udp_reg_token.clone();
        let reg_acked = udp_reg_acked.clone();
        let reg_task = tokio::spawn(async move {
            // Wait up to 30 s total; poll for a token first (it arrives shortly
            // after the pipeline starts, via the WS voice_joined message).
            let deadline = tokio::time::Instant::now() + Duration::from_secs(30);
            let mut interval = tokio::time::interval(Duration::from_millis(500));
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

            loop {
                interval.tick().await;

                if tokio::time::Instant::now() >= deadline {
                    // Only warn if we actually had a token to register.
                    let has_token = reg_token.lock().unwrap().is_some();
                    if has_token && !reg_acked.load(Ordering::Acquire) {
                        tracing::warn!("UDP registration timed out after 30 s (no VXRA received)");
                    }
                    return;
                }

                if reg_acked.load(Ordering::Acquire) {
                    // Already acked — nothing more to do.
                    return;
                }

                let token_opt = reg_token.lock().unwrap().clone();
                let token = match token_opt {
                    Some(t) => t,
                    None => continue, // token not yet set, keep polling
                };

                // Build the 68-byte VXRG packet: b"VXRG" + 64 ASCII hex chars.
                let mut pkt = Vec::with_capacity(68);
                pkt.extend_from_slice(b"VXRG");
                pkt.extend_from_slice(token.as_bytes());

                if let Err(e) = reg_socket.send_raw(&pkt).await {
                    tracing::warn!("UDP VXRG send error: {e}");
                }
            }
        });

        tracing::info!("P2P voice started → {remote_addr}");

        Ok(Self {
            _capture: capture,
            _playback: playback,
            tasks: vec![send_task, recv_task, reg_task],
            local_udp_port: actual_local_port,
            speaking_rx: Some(speaking_rx),
            level_rx: Some(level_rx),
            whisper_rx: Some(whisper_rx),
            muted,
            deafened,
            gain_map,
            roster_map,
            udp_reg_token,
            udp_reg_acked,
            active_clip,
            opus_rate,
        })
    }

    /// Set the UDP registration token. The registration loop (already running)
    /// will pick it up on its next 500 ms tick and start sending VXRG packets.
    /// Call this immediately after the hub delivers the `voice_joined` message.
    /// Does nothing if ack already received or if called on a loopback pipeline
    /// (which has no real UDP hub).
    pub fn register_udp(&self, token: String) {
        if !self.udp_reg_acked.load(Ordering::Acquire) {
            *self.udp_reg_token.lock().unwrap() = Some(token);
        }
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
