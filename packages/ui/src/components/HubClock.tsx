import { useEffect, useState } from "react";

interface Props {
  /** IANA timezone name (e.g. "America/New_York"). Renders nothing when
   *  null/undefined — most hubs don't set one. */
  timezone: string | null | undefined;
}

// Ambient hub-local clock (decisions.md "Hub timezone + birthday badge"):
// flavor and a reference point only — message/event timestamps stay in the
// viewer's own local time everywhere else.
export function HubClock({ timezone }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!timezone) return;
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [timezone]);

  if (!timezone) return null;

  let time: string;
  let hour: number;
  try {
    time = new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(now);
    hour = Number(
      new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(now),
    );
  } catch {
    // Unrecognized/stale IANA name — say nothing rather than a garbled clock.
    return null;
  }

  const isDay = hour >= 6 && hour < 18;

  return (
    <span className="hub-clock" title={`Hub local time (${timezone})`}>
      {isDay ? "☀️" : "🌙"} {time}
    </span>
  );
}
