import { describe, expect, it } from 'vitest';
import OpusScript from 'opusscript';
import { resolveOpusConfig } from '../opusConfig';

describe('resolveOpusConfig', () => {
  // The capture path is mono and the decoder is built from the same number.
  // A stereo encoder against a mono buffer is read as half as many interleaved
  // pairs, which decimates each channel by two and aliases — it reached the far
  // end as the speaker plus a pitch-shifted copy. Every profile must stay at 1.
  it.each([
    [undefined],
    [{}],
    [{ profile: 'standard' as const }],
    [{ profile: 'music' as const }],
    [{ profile: 'custom' as const }],
    [{ profile: 'custom' as const, customApp: 'audio' as const }],
  ])('is mono for %j', (cfg) => {
    expect(resolveOpusConfig(cfg).channels).toBe(1);
  });

  it('still selects the music codec mode, which is the part that works', () => {
    expect(resolveOpusConfig({ profile: 'music' }).app).toBe(OpusScript.Application.AUDIO);
  });

  it('maps the custom application, defaulting to voip', () => {
    expect(resolveOpusConfig({ profile: 'custom' }).app).toBe(OpusScript.Application.VOIP);
    expect(resolveOpusConfig({ profile: 'custom', customApp: 'lowdelay' }).app).toBe(
      OpusScript.Application.RESTRICTED_LOWDELAY,
    );
  });
});
