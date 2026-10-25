export const FRAME_SAMPLES = 960; // 20 ms at 48 kHz

/** Frames older than this at the moment the encoder picks them up count as
 *  late: two frame periods is where a listener starts to hear the gap. */
export const LATE_FRAME_MS = 40;

export interface CaptureFrame {
  /** Index of the frame's first sample on the AudioContext timeline. */
  startFrame: number;
  /** Wall clock (ms) when the frame was completed in the worklet. */
  capturedAt: number;
  samples: Float32Array;
}

/** Re-chunks the render thread's 128-sample blocks into 20 ms frames. */
export class FrameAccumulator {
  private buf = new Float32Array(FRAME_SAMPLES);
  private len = 0;
  private start = 0;
  private next = -1;

  push(block: Float32Array, blockStart: number, now: number, emit: (frame: CaptureFrame) => void): void {
    // A jump on the context timeline means blocks went missing; a half-filled
    // frame spanning the hole would splice two unrelated moments together.
    if (blockStart !== this.next) this.len = 0;
    this.next = blockStart + block.length;

    let off = 0;
    while (off < block.length) {
      if (this.len === 0) this.start = blockStart + off;
      const take = Math.min(FRAME_SAMPLES - this.len, block.length - off);
      this.buf.set(block.subarray(off, off + take), this.len);
      this.len += take;
      off += take;
      if (this.len === FRAME_SAMPLES) {
        emit({ startFrame: this.start, capturedAt: now, samples: this.buf });
        // The emitted buffer is transferred away, so it cannot be reused.
        this.buf = new Float32Array(FRAME_SAMPLES);
        this.len = 0;
      }
    }
  }
}

export interface CaptureStats {
  /** Frames the encoder received. */
  processed: number;
  /** Frames the capture side produced that never arrived (gap in the
   *  timeline stamps). */
  dropped: number;
  /** Frames that arrived but waited longer than LATE_FRAME_MS. */
  late: number;
  maxTransitMs: number;
}

export const INITIAL_CAPTURE_STATS: CaptureStats = { processed: 0, dropped: 0, late: 0, maxTransitMs: 0 };

/** Compares the worklet's stamps against what the encoder actually saw. */
export class FrameTracker {
  private stats: CaptureStats = { ...INITIAL_CAPTURE_STATS };
  private expected = -1;

  observe(startFrame: number, capturedAt: number, now: number): void {
    if (this.expected >= 0 && startFrame > this.expected) {
      this.stats.dropped += Math.round((startFrame - this.expected) / FRAME_SAMPLES);
    }
    this.expected = startFrame + FRAME_SAMPLES;
    const transit = Math.max(0, now - capturedAt);
    this.stats.processed++;
    if (transit > LATE_FRAME_MS) this.stats.late++;
    if (transit > this.stats.maxTransitMs) this.stats.maxTransitMs = transit;
  }

  snapshot(): CaptureStats {
    return { ...this.stats };
  }
}
