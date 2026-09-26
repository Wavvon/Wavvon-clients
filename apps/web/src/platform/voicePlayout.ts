// Playout scheduling for received voice frames.
//
// `playPcm` used to call `src.start()` with no argument, which means "play at
// once". Frames arrive every 20 ms, so on a loopback — where they arrive 20 ms
// apart almost exactly — that sounded gapless and the whole transport tested
// clean locally. Across the internet it cannot work: a frame 5 ms late leaves
// 5 ms of silence, and two frames arriving together both start immediately and
// *overlap* instead of queueing. That is the "audio a tratti" the first
// external operator reported.
//
// The fix is a small per-sender playout clock: each frame is scheduled where
// the previous one ends, held a short distance ahead of the audio clock so a
// late frame still lands in its slot.

/** How far ahead of `currentTime` a stream is held, in seconds.
 *  60 ms = three frames — enough to absorb ordinary internet jitter, small
 *  enough that nobody hears it as delay. */
export const PLAYOUT_LEAD = 0.06;

/** Ceiling on the scheduled queue, in seconds. A sender that bursts, or whose
 *  sample clock runs fast, would otherwise push playout further and further
 *  into the future: latency would climb for the whole call and never recover.
 *  Hitting this drops back to the lead, which costs one audible skip instead
 *  of permanent lag. */
export const MAX_PLAYOUT_QUEUE = 0.2;

/**
 * When to start the frame just received.
 *
 * @param prevEnd  when this sender's previously scheduled frame ends, or
 *                 `undefined`/0 for the first frame of a stream
 * @param now      the audio context's `currentTime`
 * @returns        the `AudioBufferSourceNode.start()` time
 *
 * Pure so the scheduling can be tested without a Web Audio context, which is
 * the part worth testing — the node plumbing around it is trivial.
 */
export function nextPlayoutStart(prevEnd: number | undefined, now: number): number {
  const floor = now + PLAYOUT_LEAD;

  // First frame, or an underrun: the stream had a real gap (silence, loss, a
  // throttled tab) and the previous frame has already finished. Rebuild the
  // lead rather than scheduling in the past, which the Web Audio API treats as
  // "now" — the overlap this exists to avoid.
  //
  // The test is `prevEnd <= now`, not `prevEnd < floor`: while the previous
  // frame is still playing there is no gap to repair, and resetting to the
  // lead every time the queue happened to be shallow would insert a skip on a
  // perfectly healthy stream. That was the first draft of this function, and
  // its own test caught it. The lead is therefore built once, at the start of
  // a stream, and holds by itself as long as frames keep arriving.
  if (prevEnd === undefined || prevEnd <= now) return floor;

  // Running too far ahead — see MAX_PLAYOUT_QUEUE.
  if (prevEnd > now + MAX_PLAYOUT_QUEUE) return floor;

  return prevEnd;
}
