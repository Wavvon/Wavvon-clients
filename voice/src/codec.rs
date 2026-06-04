use anyhow::{Context, Result};
use audiopus::coder::{Decoder as OpusDecoder, Encoder as OpusEncoder};
use audiopus::{Application, Bitrate, Channels, SampleRate};

use crate::protocol::MAX_PACKET_SIZE;

fn to_opus_rate(rate: u32) -> Result<SampleRate> {
    match rate {
        8000 => Ok(SampleRate::Hz8000),
        12000 => Ok(SampleRate::Hz12000),
        16000 => Ok(SampleRate::Hz16000),
        24000 => Ok(SampleRate::Hz24000),
        48000 => Ok(SampleRate::Hz48000),
        _ => anyhow::bail!("Unsupported sample rate for Opus: {rate}. Supported: 8000, 12000, 16000, 24000, 48000"),
    }
}

/// Resolved audio configuration passed to the voice pipeline.
#[derive(Clone, Debug)]
pub struct EffectiveVoiceConfig {
    pub opus_app: Application,
    /// Bitrate in kbps. None = Opus auto.
    pub bitrate: Option<u32>,
    pub channels: Channels,
    /// Opus frame duration in milliseconds: 20, 40, or 60.
    pub frame_duration_ms: u32,
    /// Encoder complexity 0–10.
    pub complexity: u32,
    pub noise_suppress: bool,
    pub vad_enabled: bool,
    pub vad_threshold: f32,
}

impl Default for EffectiveVoiceConfig {
    fn default() -> Self {
        Self {
            opus_app: Application::Voip,
            bitrate: None,
            channels: Channels::Mono,
            frame_duration_ms: 20,
            complexity: 5,
            noise_suppress: true,
            vad_enabled: true,
            vad_threshold: crate::pipeline::DEFAULT_VAD_THRESHOLD,
        }
    }
}

/// Calculate frame size for a given duration at the given sample rate.
pub fn frame_size_for_rate_and_ms(sample_rate: u32, frame_ms: u32) -> usize {
    (sample_rate as usize) * frame_ms as usize / 1000
}

/// Calculate frame size for 20ms at the given sample rate (backward compat).
pub fn frame_size_for_rate(sample_rate: u32) -> usize {
    frame_size_for_rate_and_ms(sample_rate, 20)
}

pub struct VoiceEncoder {
    encoder: OpusEncoder,
    pub frame_size: usize,
    frame_buf: Vec<f32>,
    encode_buf: Vec<u8>,
}

impl VoiceEncoder {
    pub fn new(sample_rate: u32, config: &EffectiveVoiceConfig) -> Result<Self> {
        let opus_rate = to_opus_rate(sample_rate)?;
        let mut encoder = OpusEncoder::new(opus_rate, config.channels, config.opus_app)
            .context("Failed to create Opus encoder")?;

        if let Some(kbps) = config.bitrate {
            encoder
                .set_bitrate(Bitrate::BitsPerSecond((kbps * 1000) as i32))
                .context("Failed to set bitrate")?;
        }

        // complexity() takes u8 in audiopus 0.2; clamp to 0–10.
        let c = config.complexity.min(10) as u8;
        let _ = encoder.set_complexity(c); // best-effort; ignore error

        let frame_size = frame_size_for_rate_and_ms(sample_rate, config.frame_duration_ms);
        Ok(Self {
            encoder,
            frame_size,
            frame_buf: Vec::with_capacity(frame_size),
            encode_buf: vec![0u8; MAX_PACKET_SIZE],
        })
    }

    pub fn encode(&mut self, samples: &[f32]) -> Vec<Vec<u8>> {
        let mut packets = Vec::new();
        self.frame_buf.extend_from_slice(samples);

        while self.frame_buf.len() >= self.frame_size {
            let frame: Vec<f32> = self.frame_buf.drain(..self.frame_size).collect();

            match self.encoder.encode_float(&frame, &mut self.encode_buf) {
                Ok(len) => {
                    packets.push(self.encode_buf[..len].to_vec());
                }
                Err(e) => {
                    tracing::warn!("Opus encode error: {e}");
                }
            }
        }

        packets
    }
}

pub struct VoiceDecoder {
    decoder: OpusDecoder,
    frame_size: usize,
    decode_buf: Vec<f32>,
}

impl VoiceDecoder {
    pub fn new(sample_rate: u32) -> Result<Self> {
        let opus_rate = to_opus_rate(sample_rate)?;
        let decoder = OpusDecoder::new(opus_rate, Channels::Mono)
            .context("Failed to create Opus decoder")?;
        let frame_size = frame_size_for_rate(sample_rate);

        Ok(Self {
            decoder,
            frame_size,
            decode_buf: vec![0.0f32; frame_size],
        })
    }

    pub fn decode(&mut self, packet: &[u8]) -> Result<&[f32]> {
        let len = self
            .decoder
            .decode_float(Some(packet), &mut self.decode_buf, false)
            .context("Opus decode error")?;

        Ok(&self.decode_buf[..len])
    }
}
