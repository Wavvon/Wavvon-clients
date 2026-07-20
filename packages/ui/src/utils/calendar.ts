import { dayKey } from "@wavvon/core";
import type { HubEvent } from "../types";

// 42 local-midnight days (6 weeks × 7) covering `month` (0-indexed, JS Date
// convention) plus the leading/trailing days needed to fill whole weeks,
// week starting Sunday to match `Date#getDay()`/`toLocaleDateString`
// weekday-row order used by EventCalendar.
export function monthGrid(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }
  return days;
}

// Buckets events by their local start day ("YYYY-MM-DD"). Multi-day events
// are bucketed by start only (events.md §9 "out of scope: multi-day spanning").
export function eventsByDay(events: HubEvent[]): Map<string, HubEvent[]> {
  const map = new Map<string, HubEvent[]>();
  for (const event of events) {
    const key = dayKey(event.starts_at);
    const bucket = map.get(key);
    if (bucket) bucket.push(event);
    else map.set(key, [event]);
  }
  return map;
}
