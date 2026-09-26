import { describe, it, expect } from "vitest";
import type { HubEvent } from "../../types";
import { eventsByDay, localDateTimeValue, monthGrid, nextHalfHourValue } from "../calendar";

function makeEvent(overrides: Partial<HubEvent> = {}): HubEvent {
  return {
    id: "event-1",
    title: "Raid night",
    description: null,
    location: null,
    starts_at: 0,
    ends_at: null,
    created_at: 0,
    rsvp_counts: { going: 0, maybe: 0, not_going: 0 },
    slots: [],
    reminder_minutes: null,
    reminder_sent_at: null,
    hub_wide: false,
    propagate_to_children: false,
    ...overrides,
  };
}

describe("monthGrid", () => {
  it("always returns exactly 42 days", () => {
    expect(monthGrid(2026, 1).length).toBe(42); // Feb 2026, 28 days
    expect(monthGrid(2026, 6).length).toBe(42); // Jul 2026, 31 days
    expect(monthGrid(2024, 1).length).toBe(42); // Feb 2024, leap year
  });

  it("starts on a Sunday and ends on a Saturday", () => {
    const grid = monthGrid(2026, 6);
    expect(grid[0].getDay()).toBe(0);
    expect(grid[41].getDay()).toBe(6);
  });

  it("contains every day of the requested month", () => {
    const grid = monthGrid(2026, 6); // July 2026
    const inMonth = grid.filter((d) => d.getMonth() === 6 && d.getFullYear() === 2026);
    expect(inMonth.length).toBe(31);
    expect(inMonth[0].getDate()).toBe(1);
    expect(inMonth[30].getDate()).toBe(31);
  });

  it("uses local midnight for every cell", () => {
    const grid = monthGrid(2026, 6);
    for (const d of grid) {
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
      expect(d.getSeconds()).toBe(0);
    }
  });

  it("pads leading/trailing days from the neighboring months", () => {
    const grid = monthGrid(2026, 6); // July 2026 starts on a Wednesday
    expect(grid[0].getMonth()).toBe(5); // June padding
    expect(grid[41].getMonth()).toBe(7); // August padding
  });
});

describe("eventsByDay", () => {
  it("buckets an event under its local start day", () => {
    const startsAt = Math.floor(new Date(2026, 6, 15, 20, 0, 0).getTime() / 1000);
    const event = makeEvent({ starts_at: startsAt });
    const map = eventsByDay([event]);
    expect(map.get("2026-07-15")).toEqual([event]);
    expect(map.size).toBe(1);
  });

  it("groups multiple events on the same local day", () => {
    const day = new Date(2026, 6, 15);
    const a = makeEvent({ id: "a", starts_at: Math.floor(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9).getTime() / 1000) });
    const b = makeEvent({ id: "b", starts_at: Math.floor(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 21).getTime() / 1000) });
    const map = eventsByDay([a, b]);
    expect(map.get("2026-07-15")).toEqual([a, b]);
  });

  it("buckets a multi-day event by its start day only", () => {
    const startsAt = Math.floor(new Date(2026, 6, 15, 23, 0, 0).getTime() / 1000);
    const endsAt = Math.floor(new Date(2026, 6, 16, 2, 0, 0).getTime() / 1000);
    const event = makeEvent({ starts_at: startsAt, ends_at: endsAt });
    const map = eventsByDay([event]);
    expect(map.has("2026-07-15")).toBe(true);
    expect(map.has("2026-07-16")).toBe(false);
  });

  it("returns an empty map for no events", () => {
    expect(eventsByDay([]).size).toBe(0);
  });
});

describe("localDateTimeValue", () => {
  it("formats a local datetime-local value without shifting the timezone", () => {
    // Local constructor, so this is 21:05 wherever the test runs — the point
    // is that the output says 21:05 and not the UTC equivalent.
    expect(localDateTimeValue(new Date(2026, 7, 21, 21, 5))).toBe("2026-08-21T21:05");
  });

  it("zero-pads month, day, hour and minute", () => {
    expect(localDateTimeValue(new Date(2026, 0, 2, 3, 4))).toBe("2026-01-02T03:04");
  });
});

describe("nextHalfHourValue", () => {
  it("rounds up to :30 within the first half of the hour", () => {
    expect(nextHalfHourValue(new Date(2026, 7, 21, 14, 10))).toBe("2026-08-21T14:30");
  });

  it("rounds up to the next hour from exactly :30", () => {
    expect(nextHalfHourValue(new Date(2026, 7, 21, 14, 30))).toBe("2026-08-21T15:00");
  });

  it("rounds up to the next hour in the second half", () => {
    expect(nextHalfHourValue(new Date(2026, 7, 21, 14, 45))).toBe("2026-08-21T15:00");
  });

  it("rolls over midnight, and with it the date", () => {
    expect(nextHalfHourValue(new Date(2026, 7, 21, 23, 45))).toBe("2026-08-22T00:00");
  });

  it("never returns a value in the past", () => {
    const now = new Date(2026, 7, 21, 9, 0);
    expect(new Date(nextHalfHourValue(now)).getTime()).toBeGreaterThan(now.getTime());
  });
});
