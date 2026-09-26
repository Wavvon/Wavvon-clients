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

// `<input type="datetime-local">` takes a *local* `YYYY-MM-DDTHH:mm`.
// `toISOString()` would shift it by the timezone offset, so an event created
// at 21:00 in Rome would come back as 19:00.
export function localDateTimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

// A start value for a fresh event: the next half-hour boundary strictly after
// `now`. An empty `datetime-local` is why the composer felt broken — the
// native picker highlights a time it has not committed, so closing it left
// the field empty and the submit guard rejected it with the user believing a
// time was set.
export function nextHalfHourValue(now: Date = new Date()): string {
  const d = new Date(now.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  return localDateTimeValue(d);
}
