import { useTranslation } from "react-i18next";
import { MUTE_FOR, muteDeadline } from "../../utils/muteExpiry";

/** The timed choices of a notifications submenu ("Silence" is the untimed
 *  one beside them), and when the current mute ends. */
export function MuteForItems({ itemClassName, until, onMuteUntil, onDone }: {
  itemClassName: string;
  /** Deadline of the mute in force here, if it is a timed one. */
  until?: number;
  onMuteUntil: (until: number) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {until !== undefined && (
        <div className="context-menu-subheader">
          {t("hub.mute.until", { time: formatMuteEnd(until) })}
        </div>
      )}
      {MUTE_FOR.map((choice) => (
        <button
          key={choice}
          className={itemClassName}
          onClick={() => { onDone(); onMuteUntil(muteDeadline(choice)); }}
        >
          {t(`hub.mute.for_${choice}`)}
        </button>
      ))}
    </>
  );
}

/** "14:30", or "Tue 08:00" when the mute ends on another day. */
export function formatMuteEnd(until: number, now: Date = new Date()): string {
  const d = new Date(until);
  const sameDay = d.toDateString() === now.toDateString();
  return d.toLocaleString(undefined, sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { weekday: "short", hour: "2-digit", minute: "2-digit" });
}
