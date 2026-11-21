import { useEffect, useRef } from "react";
import { expiredMutes, type ExpiredMutes, type MuteDeadlines } from "../utils/muteExpiry";

// setTimeout overflows past 2^31-1 ms and fires at once.
const MAX_DELAY = 2_147_483_647;

/** Calls `onExpire` with every timed mute whose deadline has passed: at once
 *  for those already past (a reload after the mute ended), then on a timer
 *  for the next one. The deadline is the record; this timer only reacts. */
export function useMuteExpiry(deadlines: MuteDeadlines, onExpire: (expired: ExpiredMutes) => void): void {
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  useEffect(() => {
    const { expired, next } = expiredMutes(deadlines);
    if (expired.hubs.length || expired.channels.length) {
      onExpireRef.current(expired);
      return;
    }
    if (next === null) return;
    const timer = setTimeout(
      () => onExpireRef.current(expiredMutes(deadlines).expired),
      Math.min(MAX_DELAY, Math.max(0, next - Date.now() + 50)),
    );
    return () => clearTimeout(timer);
  }, [deadlines]);
}
