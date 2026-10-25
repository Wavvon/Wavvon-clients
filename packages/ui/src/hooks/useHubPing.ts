import { useEffect, useRef, useState } from "react";

/** How often each hub is probed. */
export const PING_INTERVAL_MS = 15_000;

/** Consecutive failed probes before a hub is called offline. One failed probe
 *  is not an answer: a timeout, a 429, or a reconnect window where the session
 *  is not registered yet all throw, and a hub that is perfectly reachable would
 *  otherwise be labelled down until the next tick — while the live socket is
 *  still reporting a latency in the channel header. */
export const OFFLINE_AFTER_FAILURES = 3;

/**
 * Latency per hub, in milliseconds.
 *
 * The three states are distinct on purpose and callers must keep them apart:
 * `undefined` — never measured, `number` — last good reading, `null` — probed
 * repeatedly and unreachable. Collapsing the first and third is what let a
 * single transient failure render as the word "offline".
 */
export type PingByHub = Record<string, number | null>;

export interface HubPingState {
  ping: number | null | undefined;
  failures: number;
}

/**
 * One probe's effect on one hub's state.
 *
 * Pure, so the rule that decides when a hub is called offline can be pinned by
 * a test without a DOM or a clock.
 */
export function applyProbeResult(
  state: HubPingState,
  result: { ok: true; ms: number } | { ok: false },
): HubPingState {
  if (result.ok) return { ping: result.ms, failures: 0 };
  const failures = state.failures + 1;
  // Below the threshold the last good reading stands. Saying nothing is
  // honest; saying "offline" is a claim a single failed probe cannot support.
  if (failures < OFFLINE_AFTER_FAILURES) return { ping: state.ping, failures };
  return { ping: null, failures };
}

/**
 * Probes each hub on an interval and reports latency.
 *
 * `probe` resolves to the round trip in ms, or throws. Both clients pass their
 * own: web fetches `/health`, desktop invokes `ping_hub`.
 */
export function useHubPing(hubIds: string[], probe: (hubId: string) => Promise<number>): PingByHub {
  const [pingByHub, setPingByHub] = useState<PingByHub>({});
  const failures = useRef<Record<string, number>>({});
  const latest = useRef<Record<string, number | null | undefined>>({});
  const probeRef = useRef(probe);
  probeRef.current = probe;

  const key = hubIds.join(",");

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) return;
    let cancelled = false;

    async function tick() {
      for (const id of ids) {
        if (cancelled) return;
        let result: { ok: true; ms: number } | { ok: false };
        try {
          result = { ok: true, ms: await probeRef.current(id) };
        } catch {
          result = { ok: false };
        }
        if (cancelled) return;
        const next = applyProbeResult(
          { ping: latest.current[id], failures: failures.current[id] ?? 0 },
          result,
        );
        failures.current[id] = next.failures;
        latest.current[id] = next.ping;
        if (next.ping !== undefined) {
          setPingByHub((prev) => (prev[id] === next.ping ? prev : { ...prev, [id]: next.ping as number | null }));
        }
      }
    }

    void tick();
    const interval = setInterval(() => { void tick(); }, PING_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [key]);

  return pingByHub;
}
