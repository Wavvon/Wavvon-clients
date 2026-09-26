// Live connection numbers: round-trip latency with its spread, and inbound
// voice packet loss.
//
// Two independent paths, and conflating them would mislead. Latency is
// measured on the hub WebSocket (`ping` → `pong`, the hub echoing an opaque
// nonce) and is meaningful whenever you are connected. Packet loss is a
// property of the voice datagram stream and only exists while you are in a
// voice channel.
//
// Outbound loss is deliberately absent rather than guessed: a sender cannot
// know which of its own packets failed to arrive. The relay can — the voice
// header's `ctr` is cleartext, so the hub sees gaps in a sender's counter
// sequence — but that is a hub-side counter and a separate change. Showing a
// fabricated 0.0% would be worse than showing nothing.

/** Latency samples kept for the rolling figures. At one probe every 2 s this
 *  is a 20-second window: long enough to be steady, short enough to react. */
export const RTT_WINDOW = 10;

export interface RttStats {
  /** Median round trip in ms, or null before the first reply. */
  rttMs: number | null;
  /** Mean absolute deviation from the median, in ms — the "± 0.5" figure.
   *  Null until there are at least two samples to deviate. */
  jitterMs: number | null;
  /** How many probes are behind these numbers. */
  samples: number;
}

/**
 * Median rather than mean, and mean-absolute-deviation rather than standard
 * deviation: one stalled probe on a flaky link should not move the headline
 * number, and MAD does not square the outlier that median just ignored.
 */
export function rttStats(samplesMs: readonly number[]): RttStats {
  const usable = samplesMs.filter((n) => Number.isFinite(n) && n >= 0);
  if (usable.length === 0) return { rttMs: null, jitterMs: null, samples: 0 };

  const sorted = [...usable].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  if (usable.length === 1) {
    return { rttMs: Math.round(median), jitterMs: null, samples: 1 };
  }

  const mad = usable.reduce((sum, n) => sum + Math.abs(n - median), 0) / usable.length;
  return {
    rttMs: Math.round(median),
    jitterMs: Math.round(mad * 10) / 10,
    samples: usable.length,
  };
}

/** Push a sample into a fixed-size ring, oldest out. */
export function pushSample(window: readonly number[], sample: number, size = RTT_WINDOW): number[] {
  const next = [...window, sample];
  return next.length > size ? next.slice(next.length - size) : next;
}

export interface LossTracker {
  /** Highest counter seen from this sender. */
  highestCtr: bigint;
  /** Datagrams actually received. */
  received: number;
  /** Counter of the first packet seen, so the expected count is derivable. */
  firstCtr: bigint;
}

/**
 * Fold one received voice datagram into a per-sender loss tracker.
 *
 * The counter is the sender's own monotonic sequence, in the cleartext part of
 * the packet header, so gaps are visible without decrypting anything. Out-of-
 * order and replayed packets are counted as received but never move the
 * highest-seen mark backwards — otherwise reordering would read as loss, which
 * on a QUIC datagram path it routinely is not.
 */
export function trackPacket(prev: LossTracker | undefined, ctr: bigint): LossTracker {
  if (!prev) return { highestCtr: ctr, received: 1, firstCtr: ctr };
  return {
    highestCtr: ctr > prev.highestCtr ? ctr : prev.highestCtr,
    received: prev.received + 1,
    firstCtr: ctr < prev.firstCtr ? ctr : prev.firstCtr,
  };
}

/**
 * Inbound loss for one sender, as a percentage.
 *
 * Expected is derived from the counter span rather than from elapsed time: a
 * sender who is simply silent sends nothing, and time-based arithmetic would
 * report that silence as 100% loss.
 */
export function lossPercent(t: LossTracker | undefined): number | null {
  if (!t) return null;
  const expected = Number(t.highestCtr - t.firstCtr) + 1;
  if (expected <= 1) return null;
  const lost = expected - t.received;
  if (lost <= 0) return 0;
  return Math.round((lost / expected) * 1000) / 10;
}
