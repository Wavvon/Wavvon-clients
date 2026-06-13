let cachedAudioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  return (
    cachedAudioCtx ??
    (cachedAudioCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)())
  );
}

export function playMentionPing() {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    const tone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.18, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur);
    };
    tone(880, 0, 0.12);
    tone(1175, 0.08, 0.18);
  } catch {
    // best-effort
  }
}

export function playVoiceTone(direction: "up" | "down") {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    const tone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.14, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur);
    };
    if (direction === "up") {
      tone(523, 0, 0.1);
      tone(784, 0.07, 0.16);
    } else {
      tone(784, 0, 0.1);
      tone(523, 0.07, 0.16);
    }
  } catch {
    // best-effort
  }
}
