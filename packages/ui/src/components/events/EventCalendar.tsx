import React from "react";
import { useTranslation } from "react-i18next";
import type { HubEvent } from "../../types";
import { eventsByDay, monthGrid } from "../../utils/calendar";
import { formatDate } from "@wavvon/core";

interface Props {
  events: HubEvent[];
  month: Date;
  onMonthChange: (month: Date) => void;
  onSelectDay: (day: Date | null) => void;
  selectedDay: Date | null;
}

function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}


export function EventCalendar({ events, month, onMonthChange, onSelectDay, selectedDay }: Props) {
  const { t } = useTranslation();
  const grid = monthGrid(month.getFullYear(), month.getMonth());
  const byDay = eventsByDay(events);
  const todayKey = localKey(new Date());
  const selectedKey = selectedDay ? localKey(selectedDay) : null;

  function goToMonth(delta: number) {
    onMonthChange(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  }

  function selectDay(day: Date) {
    onSelectDay(selectedKey === localKey(day) ? null : day);
  }

  return (
    <div className="settings-card" style={{ padding: 10, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button
          className="btn-secondary"
          style={{ fontSize: "var(--text-xs)", padding: "2px 8px" }}
          onClick={() => goToMonth(-1)}
          aria-label={t("events.calendar.prev_month")}
        >
          ‹
        </button>
        <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{formatDate(month, { month: "long", year: "numeric" })}</div>
        <button
          className="btn-secondary"
          style={{ fontSize: "var(--text-xs)", padding: "2px 8px" }}
          onClick={() => goToMonth(1)}
          aria-label={t("events.calendar.next_month")}
        >
          ›
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
        {grid.slice(0, 7).map((d) => (
          <div key={d.getDay()} className="muted" style={{ textAlign: "center", fontSize: "var(--text-xs)" }}>
            {formatDate(d, { weekday: "short" })}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {grid.map((day) => {
          const key = localKey(day);
          const dayEvents = byDay.get(key) ?? [];
          const inMonth = day.getMonth() === month.getMonth();
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          return (
            <button
              key={key}
              type="button"
              className={isSelected ? "btn-primary" : "btn-secondary"}
              onClick={() => selectDay(day)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                padding: "6px 2px",
                minHeight: 40,
                opacity: inMonth ? 1 : 0.4,
                outline: isToday ? "1px solid var(--accent)" : undefined,
              }}
            >
              <span style={{ fontSize: "var(--text-xs)" }}>{day.getDate()}</span>
              {dayEvents.length > 0 && (
                <span style={{ fontSize: "var(--text-xs)", color: isSelected ? undefined : "var(--accent)" }}>
                  {dayEvents.length > 1 ? `${dayEvents.length} •` : "•"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
