// The locale every formatter below renders in.
//
// `undefined` means the runtime's own locale, which is what this file used
// throughout and is the right default for a consumer that never says
// otherwise. It is not right for the apps: the language is a setting
// (`wavvon_language`), and somebody who picks Italian on an English browser
// was getting Italian text beside English dates. `initI18n` sets this at
// startup and again on every `languageChanged`, so the one place that knows
// the chosen language is the one place that answers for it — rather than four
// call sites across two apps, each able to forget.
let formatLocale: string | undefined;

/** Point the date/duration formatters at a locale. See `formatLocale`. */
export function setFormatLocale(locale: string | undefined): void {
  formatLocale = locale;
}

/** `Intl.DateTimeFormat` in the app language. Build one per call: a cached one
 *  would keep the language it was created under. */
export function dateTimeFormat(options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(formatLocale, options);
}

/** Calendar date in the app language. Accepts a Date or unix seconds. */
export function formatDate(when: Date | number, options?: Intl.DateTimeFormatOptions): string {
  return dateTimeFormat(options).format(typeof when === "number" ? toUnixSec(when) * 1000 : when);
}

/** Date plus time in the app language (default: short both). */
export function formatDateTime(when: Date | number, options?: Intl.DateTimeFormatOptions): string {
  return formatDate(when, options ?? { dateStyle: "short", timeStyle: "short" });
}

/** Time of day in the app language. */
export function formatTime(when: Date | number, options?: Intl.DateTimeFormatOptions): string {
  return formatDate(when, options ?? { hour: "2-digit", minute: "2-digit" });
}

// Latin-script label at the start of its own line: "oggi", "heute" and
// "yesterday" all want a capital there, and none of the four locales has a
// casing rule that makes this wrong.
function capitalizeFirst(s: string): string {
  return s ? s[0].toLocaleUpperCase(formatLocale) + s.slice(1) : s;
}

export function formatPubkey(key: string | null | undefined): string {
  if (!key) return "";
  if (key.length < 20) return key;
  const head = key.slice(0, 12).match(/.{1,4}/g)!.join("-");
  const tail = key.slice(-4);
  return `${head}…${tail}`;
}

export function meAction(content: string): string | null {
  if (content.startsWith("/me ") && content.length > 4) {
    return content.slice(4);
  }
  return null;
}

export function mentionsName(content: string, name: string | null): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  const re = /@([\w.-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m[1].toLowerCase() === lower) return true;
  }
  return false;
}

export function colorForKey(pubkey: string | null | undefined): string {
  if (!pubkey) return "var(--accent)";
  let h = 2166136261;
  for (let i = 0; i < pubkey.length; i++) {
    h ^= pubkey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = (h >>> 0) % 360;
  return `hsl(${hue}, 55%, 65%)`;
}

/// The hub mixes time units on the wire: channel messages carry
/// `created_at` in MILLISECONDS (ordering precision), everything else in
/// seconds. Normalize to seconds — a value with 13+ digits is unambiguously
/// ms until the year 33658.
function toUnixSec(v: number): number {
  return v > 1e12 ? Math.floor(v / 1000) : v;
}

export function dayKey(unixSec: number): string {
  const d = new Date(toUnixSec(unixSec) * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDayLabel(unixSec: number): string {
  const d = new Date(toUnixSec(unixSec) * 1000);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  // `numeric: "auto"` is what turns -1 day into the *word* — "yesterday",
  // "ieri", "ayer", "gestern" — instead of "1 day ago".
  const rel = new Intl.RelativeTimeFormat(formatLocale, { numeric: "auto" });
  if (dayKey(unixSec) === dayKey(today.getTime() / 1000)) {
    return capitalizeFirst(rel.format(0, "day"));
  }
  if (dayKey(unixSec) === dayKey(yest.getTime() / 1000)) {
    return capitalizeFirst(rel.format(-1, "day"));
  }
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString(formatLocale, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

export function formatFullTimestamp(unixSec: number): string {
  if (!unixSec) return "";
  const d = new Date(toUnixSec(unixSec) * 1000);
  return d.toLocaleString(formatLocale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** True when `birthday` (MM-DD, never a year) matches `now`'s local calendar
 *  day — a floating calendar date, not an instant, so this is always the
 *  viewer's own local date rather than any UTC/hub-relative comparison. */
export function isBirthdayToday(birthday: string | null | undefined, now: Date = new Date()): boolean {
  if (!birthday) return false;
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return birthday === `${mm}-${dd}`;
}

/// Largest whole unit that fits, which is the shape both functions below
/// render — one number and one unit, never "1h 5m". Takes a magnitude; the
/// caller owns the direction.
function coarsestUnit(absSeconds: number): { value: number; unit: "second" | "minute" | "hour" | "day" } {
  const s = Math.max(0, Math.floor(absSeconds));
  if (s < 60) return { value: s, unit: "second" };
  if (s < 3600) return { value: Math.floor(s / 60), unit: "minute" };
  if (s < 86400) return { value: Math.floor(s / 3600), unit: "hour" };
  return { value: Math.floor(s / 86400), unit: "day" };
}

export function formatRelative(unixSec: number): string {
  if (!unixSec) return "—";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - toUnixSec(unixSec);
  const { value, unit } = coarsestUnit(Math.abs(diff));
  // `style: "narrow"` is the compact form a message list needs, and in English
  // it is character-for-character what this used to hardcode: "45s ago",
  // "5m ago", "2h ago", "3d ago".
  //
  // The sign is passed through rather than clamped. This is documented as
  // assuming the past, and fed a future timestamp it used to print the bare
  // negative offset "-85797s ago"; clamping would have turned that into a
  // confident "0s ago", which is the quieter kind of wrong. Intl says
  // "in 23h", and a clock-skewed message reads as one.
  return new Intl.RelativeTimeFormat(formatLocale, {
    numeric: "always",
    style: "narrow",
  }).format(diff > 0 ? -value : value, unit);
}

function formatDurationMagnitude(absSeconds: number): string {
  const { value, unit } = coarsestUnit(absSeconds);
  // A magnitude with no wording and no sign — the caller supplies "expires in
  // {duration}" or "expired {duration} ago" from the `future` flag, so this
  // must not carry a direction of its own.
  return new Intl.NumberFormat(formatLocale, {
    style: "unit",
    unit,
    unitDisplay: "narrow",
  }).format(value);
}

export interface RelativeTimeResult {
  /** True when `unixSec` is still ahead of now. */
  future: boolean;
  /** Magnitude only, no sign or wording — e.g. "45s", "5m", "2h", "3d". */
  duration: string;
}

/// Sign-aware counterpart to `formatRelative`. `formatRelative` assumes the
/// timestamp is always in the past (message times, join dates); fed a future
/// timestamp it prints a bare negative offset ("-85797s ago"). Use this
/// wherever the value can legitimately be in the future too (invite expiry,
/// temporary bans, etc.) and pick the right wording (e.g. "expires in
/// {duration}" vs "expired {duration} ago") from the `future` flag.
export function formatRelativeSigned(unixSec: number): RelativeTimeResult | null {
  if (!unixSec) return null;
  const now = Math.floor(Date.now() / 1000);
  const diff = now - toUnixSec(unixSec);
  return { future: diff < 0, duration: formatDurationMagnitude(Math.abs(diff)) };
}
