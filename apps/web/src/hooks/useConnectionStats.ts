import { useEffect, useState } from "react";
import type { RttStats } from "../platform/connectionStats";

/** How often the readout refreshes. Slower than the 2 s probe on purpose:
 *  the numbers are rolling averages, and repainting faster than they can
 *  change only makes them look unstable. */
const REFRESH_MS = 1000;

export interface LiveConnection extends RttStats {
  /** Worst inbound voice loss across the senders being heard, or null when
   *  not in voice. */
  inboundLossPercent: number | null;
  /** Outbound voice loss as measured by the relay, or null when this hub does
   *  not report it. Only the relay can know this — a sender cannot see which
   *  of its own datagrams were dropped. */
  outboundLossPercent: number | null;
}

/**
 * Polls the socket and the voice session for their own counters.
 *
 * Polling rather than pushing on purpose: both sources already keep rolling
 * state (the socket owns its probe loop, the voice session folds each
 * datagram's counter), so a subscription would mean re-rendering on every
 * pong and every audio frame to display a number that only changes on a
 * human timescale.
 *
 * The getters are passed in rather than imported so this hook does not reach
 * into session management, and so a hub with no `ws.ping` capability can pass
 * one that returns nulls.
 */
export function useConnectionStats(
  getStats: () => RttStats | null,
  getInboundLoss: () => number | null,
  getOutboundLoss: () => number | null,
): LiveConnection {
  const [live, setLive] = useState<LiveConnection>({
    rttMs: null,
    jitterMs: null,
    samples: 0,
    inboundLossPercent: null,
    outboundLossPercent: null,
  });

  useEffect(() => {
    function sample() {
      const s = getStats();
      setLive({
        rttMs: s?.rttMs ?? null,
        jitterMs: s?.jitterMs ?? null,
        samples: s?.samples ?? 0,
        inboundLossPercent: getInboundLoss(),
        outboundLossPercent: getOutboundLoss(),
      });
    }
    sample();
    const id = setInterval(sample, REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return live;
}
