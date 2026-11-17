let cachedAudioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  return (
    cachedAudioCtx ??
    (cachedAudioCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)())
  );
}

// The closed set of sounds a theme can replace (themes.md section 1). Every
// sound the client plays goes through playSound.
export const SOUND_NAMES = [
  "message",
  "mention",
  "voice_join",
  "voice_leave",
  "mute",
  "unmute",
  "deafen",
  "undeafen",
] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

export function isSoundName(name: string): name is SoundName {
  return (SOUND_NAMES as readonly string[]).includes(name);
}

let themeSounds: Partial<Record<SoundName, Uint8Array>> = {};
const decoded = new Map<SoundName, Promise<AudioBuffer>>();
let volume = 1;

/** The active theme's audio files, by sound name. Decoded on first play. */
export function setThemeSounds(next: Partial<Record<SoundName, Uint8Array>>): void {
  themeSounds = next;
  decoded.clear();
}

/** The user's sound volume, 0 to 1; scales every sound, themed or built in. */
export function setSoundVolume(v: number): void {
  volume = Math.min(1, Math.max(0, v));
}

function tones(ctx: AudioContext, peak: number, list: [number, number, number][]): void {
  const now = ctx.currentTime;
  for (const [freq, start, dur] of list) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(peak * volume, now + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur);
  }
}

// What plays when a theme brings no file. message, mute, unmute, deafen and
// undeafen are silent by default: only a theme gives them a sound.
const BUILT_IN: Partial<Record<SoundName, (ctx: AudioContext) => void>> = {
  mention: (ctx) => tones(ctx, 0.18, [[880, 0, 0.12], [1175, 0.08, 0.18]]),
  voice_join: (ctx) => tones(ctx, 0.14, [[523, 0, 0.1], [784, 0.07, 0.16]]),
  voice_leave: (ctx) => tones(ctx, 0.14, [[784, 0, 0.1], [523, 0.07, 0.16]]),
};

async function playBytes(ctx: AudioContext, bytes: Uint8Array): Promise<void> {
  const buffer = await ctx.decodeAudioData(bytes.slice().buffer as ArrayBuffer);
  playBuffer(ctx, buffer);
}

function playBuffer(ctx: AudioContext, buffer: AudioBuffer): void {
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.buffer = buffer;
  src.connect(gain).connect(ctx.destination);
  src.start();
}

/** Plays a file once, at the user's volume — the editor's preview button. */
export function playSoundBytes(bytes: Uint8Array): void {
  try {
    void playBytes(getCtx(), bytes).catch(() => {});
  } catch {
    // best-effort
  }
}

export function playSound(name: SoundName): void {
  try {
    const ctx = getCtx();
    const bytes = themeSounds[name];
    if (bytes) {
      let buffer = decoded.get(name);
      if (!buffer) {
        buffer = ctx.decodeAudioData(bytes.slice().buffer as ArrayBuffer);
        decoded.set(name, buffer);
      }
      void buffer.then((b) => playBuffer(ctx, b)).catch(() => decoded.delete(name));
      return;
    }
    BUILT_IN[name]?.(ctx);
  } catch {
    // best-effort
  }
}

export function playMentionPing() {
  playSound("mention");
}

export function playVoiceTone(direction: "up" | "down") {
  playSound(direction === "up" ? "voice_join" : "voice_leave");
}
