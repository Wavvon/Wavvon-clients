//! Soundboard clip decode + mix (soundboard.md §1: "the clip is mixed
//! client-side into the triggering user's own outgoing stream").
//!
//! Clips are served by the hub as Opus-in-Ogg (see hub's
//! `routes/soundboard.rs::validate_ogg_opus`, which validates the same
//! container shape this module demuxes). Rather than pull in a full media
//! framework, this demuxes the Ogg container by hand (a few dozen lines --
//! same algorithm the hub already uses to check clip duration) and decodes
//! the extracted Opus packets with the `audiopus` decoder already used for
//! the network jitter path in `codec.rs`.

use anyhow::{bail, Context, Result};
use audiopus::coder::Decoder as OpusDecoder;
use audiopus::{Channels, SampleRate};

/// Demuxes an Ogg-Opus file into (channel_count, pre_skip, audio_packets).
/// The first two logical packets (OpusHead identification header and the
/// OpusTags comment header) are stripped -- only audio packets are returned.
fn demux_ogg_opus(bytes: &[u8]) -> Result<(u8, u16, Vec<Vec<u8>>)> {
    if bytes.len() < 4 || &bytes[0..4] != b"OggS" {
        bail!("Not a valid Ogg container");
    }

    let mut pos = 0usize;
    let mut packets: Vec<Vec<u8>> = Vec::new();
    let mut current: Vec<u8> = Vec::new();
    let mut channel_count = 0u8;
    let mut pre_skip = 0u16;

    while pos + 27 <= bytes.len() {
        if &bytes[pos..pos + 4] != b"OggS" {
            break;
        }
        let num_segments = bytes[pos + 26] as usize;
        let seg_table_start = pos + 27;
        if seg_table_start + num_segments > bytes.len() {
            bail!("Truncated Ogg page");
        }
        let segment_table = &bytes[seg_table_start..seg_table_start + num_segments];
        let mut seg_pos = seg_table_start + num_segments;

        for &seg_len in segment_table {
            let seg_len = seg_len as usize;
            if seg_pos + seg_len > bytes.len() {
                bail!("Truncated Ogg page payload");
            }
            current.extend_from_slice(&bytes[seg_pos..seg_pos + seg_len]);
            seg_pos += seg_len;

            // A segment shorter than 255 bytes ends the packet (RFC 3533 §4).
            // A run of 255-byte segments (even across a page boundary, since
            // we never reset `current` between pages) means the packet
            // continues.
            if seg_len < 255 {
                if packets.is_empty() {
                    if current.len() < 19 || &current[0..8] != b"OpusHead" {
                        bail!("Not a valid Opus stream (missing OpusHead)");
                    }
                    channel_count = current[9];
                    pre_skip = u16::from_le_bytes([current[10], current[11]]);
                }
                packets.push(std::mem::take(&mut current));
            }
        }

        pos = seg_pos;
    }

    if packets.len() < 2 {
        bail!("Ogg clip has no audio packets");
    }
    // packets[0] = OpusHead, packets[1] = OpusTags (comments) -- neither is audio.
    let audio_packets = packets.split_off(2);
    Ok((channel_count, pre_skip, audio_packets))
}

/// Decodes Opus packets into interleaved PCM at 48 kHz (Opus's decode rate
/// is independent of how the encoder was configured -- decoding at 48 kHz is
/// always valid and avoids resampling twice), downmixing stereo to mono.
fn decode_packets(packets: &[Vec<u8>], channel_count: u8) -> Result<Vec<f32>> {
    let channels = if channel_count >= 2 {
        Channels::Stereo
    } else {
        Channels::Mono
    };
    if channel_count > 2 {
        // ponytail: mapping families beyond stereo (surround/ambisonics) are
        // not supported -- soundboard clips are short mono/stereo effects,
        // upgrade to a full channel-mapping table if that ever changes.
        bail!("Soundboard clips with more than 2 channels are not supported");
    }
    let mut decoder =
        OpusDecoder::new(SampleRate::Hz48000, channels).context("Failed to create clip decoder")?;
    // Max Opus frame is 120 ms @ 48 kHz = 5760 samples/channel; double for stereo interleave.
    let mut buf = vec![0.0f32; 5760 * 2];
    let mut pcm = Vec::new();

    for packet in packets {
        let n = decoder
            .decode_float(Some(packet.as_slice()), &mut buf, false)
            .context("Opus decode error in soundboard clip")?;
        let count = if channels == Channels::Stereo {
            n * 2
        } else {
            n
        };
        pcm.extend_from_slice(&buf[..count]);
    }

    if channels == Channels::Stereo {
        Ok(pcm
            .chunks(2)
            .map(|c| (c[0] + c.get(1).copied().unwrap_or(c[0])) / 2.0)
            .collect())
    } else {
        Ok(pcm)
    }
}

/// Decodes a full Opus-in-Ogg soundboard clip to mono PCM at 48 kHz, ready
/// for `resample_linear` into the pipeline's capture rate.
pub fn decode_ogg_opus_clip(bytes: &[u8]) -> Result<Vec<f32>> {
    let (channel_count, pre_skip, audio_packets) = demux_ogg_opus(bytes)?;
    let mut pcm = decode_packets(&audio_packets, channel_count)?;
    // RFC 7845 §4.2: discard `pre_skip` priming samples (at 48 kHz) from the
    // start of decode.
    let skip = (pre_skip as usize).min(pcm.len());
    pcm.drain(0..skip);
    Ok(pcm)
}

/// A clip mid-playback: the samples to mix and how far into them we are.
pub struct ActiveClip {
    pub samples: Vec<f32>,
    pub pos: usize,
}

/// Sums as much of `clip` as fits into `frame`, saturating to the valid
/// float PCM range so a loud clip under a loud mic clips instead of
/// wrapping around. Returns `true` once the clip has been fully consumed
/// (caller should drop it).
pub fn mix_clip_into_frame(frame: &mut [f32], clip: &mut ActiveClip) -> bool {
    let remaining = clip.samples.len().saturating_sub(clip.pos);
    let n = frame.len().min(remaining);
    for i in 0..n {
        frame[i] = (frame[i] + clip.samples[clip.pos + i]).clamp(-1.0, 1.0);
    }
    clip.pos += n;
    clip.pos >= clip.samples.len()
}

/// Naive linear-interpolation resampler.
///
/// ponytail: no anti-alias filter, just linear interpolation between
/// neighboring samples -- audible quality loss on a big rate change, but
/// soundboard clips are short low-stakes sound effects, not music mastering.
/// Upgrade to a proper sinc/windowed-filter resampler (e.g. the `rubato`
/// crate) if clip fidelity complaints show up.
pub fn resample_linear(input: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate || input.is_empty() {
        return input.to_vec();
    }
    let ratio = from_rate as f64 / to_rate as f64;
    let out_len = ((input.len() as f64) / ratio).round() as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src_pos = i as f64 * ratio;
        let idx = src_pos.floor() as usize;
        let frac = (src_pos - idx as f64) as f32;
        let a = input.get(idx).copied().unwrap_or(0.0);
        let b = input.get(idx + 1).copied().unwrap_or(a);
        out.push(a + (b - a) * frac);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mix_sums_samples_and_advances_position() {
        let mut frame = [0.1f32, 0.2, 0.3, 0.4];
        let mut clip = ActiveClip {
            samples: vec![0.05, 0.05],
            pos: 0,
        };
        let done = mix_clip_into_frame(&mut frame, &mut clip);
        assert!(
            done,
            "clip is shorter than the frame, so it drains within this one call"
        );
        assert_eq!(clip.pos, 2);
        assert!((frame[0] - 0.15).abs() < 1e-6);
        assert!((frame[1] - 0.25).abs() < 1e-6);
        // Untouched tail (clip ran out): mic-only samples pass through.
        assert!((frame[2] - 0.3).abs() < 1e-6);
        assert!((frame[3] - 0.4).abs() < 1e-6);
    }

    #[test]
    fn mix_saturates_instead_of_wrapping() {
        let mut frame = [0.9f32];
        let mut clip = ActiveClip {
            samples: vec![0.9],
            pos: 0,
        };
        let done = mix_clip_into_frame(&mut frame, &mut clip);
        assert!(done);
        assert_eq!(frame[0], 1.0);
    }

    #[test]
    fn mix_reports_done_when_clip_fully_consumed() {
        let mut frame = [0.0f32; 4];
        let mut clip = ActiveClip {
            samples: vec![0.1, 0.1],
            pos: 0,
        };
        assert!(mix_clip_into_frame(&mut frame, &mut clip));
        // Calling again with an already-exhausted clip is a no-op, not a panic.
        assert!(mix_clip_into_frame(&mut frame, &mut clip));
    }

    #[test]
    fn resample_identity_when_rates_match() {
        let input = vec![0.1, 0.2, 0.3];
        assert_eq!(resample_linear(&input, 48000, 48000), input);
    }

    #[test]
    fn resample_changes_length_with_rate() {
        let input = vec![0.0; 480]; // 10ms @ 48kHz
        let out = resample_linear(&input, 48000, 24000);
        assert_eq!(out.len(), 240); // 10ms @ 24kHz
    }

    #[test]
    fn demux_rejects_non_ogg() {
        assert!(demux_ogg_opus(b"not ogg data at all").is_err());
    }

    #[test]
    fn demux_rejects_truncated_ogg() {
        assert!(demux_ogg_opus(b"OggS").is_err());
    }
}
