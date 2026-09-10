import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** What `connection_stats` reports. Every number is nullable, and a null means
 *  "no number" rather than zero — see the Rust command for why that matters. */
export interface LiveConnection {
  rttMs: number | null;
  jitterMs: number | null;
  samples: number;
  inboundLossPercent: number | null;
  outboundLossPercent: number | null;
}

interface ConnectionStatsResult {
  rtt_ms: number | null;
  jitter_ms: number | null;
  samples: number;
  inbound_loss_percent: number | null;
  outbound_loss_percent: number | null;
}

const EMPTY: LiveConnection = {
  rttMs: null,
  jitterMs: null,
  samples: 0,
  inboundLossPercent: null,
  outboundLossPercent: null,
};

/** How often the readout refreshes. Slower than the 2 s probe on purpose: the
 *  numbers are rolling averages, and repainting faster than they can change
 *  only makes them look unstable. */
const REFRESH_MS = 1000;

/**
 * Polls the shell for the connection figures.
 *
 * Polling rather than an event, matching web: the socket task and the voice
 * pipeline already keep rolling state, so pushing would mean re-rendering on
 * every pong and every audio frame to move a number that changes on a human
 * timescale.
 */
export function useConnectionStats(): LiveConnection {
  const [live, setLive] = useState<LiveConnection>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    async function sample() {
      try {
        const r = await invoke<ConnectionStatsResult>("connection_stats");
        if (cancelled) return;
        setLive({
          rttMs: r.rtt_ms,
          jitterMs: r.jitter_ms,
          samples: r.samples,
          inboundLossPercent: r.inbound_loss_percent,
          outboundLossPercent: r.outbound_loss_percent,
        });
      } catch {
        // No active hub yet, or the command is gone. Showing the last numbers
        // would be showing stale ones as live.
        if (!cancelled) setLive(EMPTY);
      }
    }
    void sample();
    const id = setInterval(() => void sample(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return live;
}
