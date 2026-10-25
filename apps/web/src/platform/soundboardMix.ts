/** Playback cursor into a decoded soundboard clip mid-mix (soundboard.md
 *  §1: the clip rides the sender's own outgoing stream). */
export interface ActiveClip {
  samples: Float32Array;
  pos: number;
}

/** Pure sample-add mix of a mic capture frame with whatever's left of an
 *  in-flight soundboard clip, clamped to the valid float PCM range so a
 *  loud clip under a loud mic can't wrap around instead of just clipping.
 *  Called once per capture frame, ahead of Opus encoding, so the
 *  clip is baked into the *outgoing* stream rather than played locally. */
export function mixClipIntoFrame(
  micFrame: Float32Array,
  clip: ActiveClip | null,
): { output: Float32Array; nextClip: ActiveClip | null } {
  const output = new Float32Array(micFrame.length);
  const samples = clip?.samples;
  let pos = clip?.pos ?? 0;

  for (let i = 0; i < micFrame.length; i++) {
    let sample = micFrame[i];
    if (samples && pos < samples.length) {
      sample += samples[pos];
      pos++;
    }
    output[i] = Math.max(-1, Math.min(1, sample));
  }

  const nextClip = samples && pos < samples.length ? { samples, pos } : null;
  return { output, nextClip };
}

/** Averages N channel buffers down to mono. Opus (and this mixer) only
 *  deals in mono at 48 kHz; a stereo clip is folded down before mixing. */
export function downmixChannels(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const length = channels[0].length;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const ch of channels) sum += ch[i];
    out[i] = sum / channels.length;
  }
  return out;
}
