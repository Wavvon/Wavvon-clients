import OpusScript from 'opusscript';

/** What an audio profile resolves to for the encoder. */
export interface OpusConfig {
  app: number;
  /** Always 1. See `resolveOpusConfig`. */
  channels: 1;
}

export interface OpusProfileInput {
  profile?: 'standard' | 'music' | 'custom';
  customApp?: 'voip' | 'audio' | 'lowdelay';
}

// The capture pipeline is mono from end to end and cannot be anything else:
// the capture worklet reads one input channel, the frame is
// read with `getChannelData(0)`, the accumulator holds OPUS_FRAME_SIZE mono
// samples, and the decoder is constructed with one channel. Asking the encoder
// for two was therefore never "stereo voice" — Opus reads an N-sample buffer as
// N/2 interleaved pairs, so the even samples became the left channel and the
// odd ones the right. Each channel carried the signal decimated by two with no
// filter, which is aliasing, and it reached the far end as the speaker's voice
// plus a pitch-shifted metallic copy of it. The music profile set it
// unconditionally and the custom profile offered it as a checkbox.
//
// Real stereo capture is a feature, not a fix: it needs a two-channel
// capture worklet, an interleaved accumulator and a stereo decoder. Until that
// exists the three ends agree on mono, and the type says so.
export function resolveOpusConfig(cfg?: OpusProfileInput): OpusConfig {
  if (cfg?.profile === 'music') {
    // Still the music codec mode — wider band, less speech-shaping — which is
    // the part of the profile that works.
    return { app: OpusScript.Application.AUDIO, channels: 1 };
  }
  if (cfg?.profile === 'custom') {
    const appMap = {
      voip: OpusScript.Application.VOIP,
      audio: OpusScript.Application.AUDIO,
      lowdelay: OpusScript.Application.RESTRICTED_LOWDELAY,
    };
    return { app: appMap[cfg.customApp ?? 'voip'], channels: 1 };
  }
  return { app: OpusScript.Application.VOIP, channels: 1 };
}
