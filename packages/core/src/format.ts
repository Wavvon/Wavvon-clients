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
  const re = /@([\w.\-]+)/g;
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
  if (dayKey(unixSec) === dayKey(today.getTime() / 1000)) return "Today";
  if (dayKey(unixSec) === dayKey(yest.getTime() / 1000)) return "Yesterday";
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

export function formatFullTimestamp(unixSec: number): string {
  if (!unixSec) return "";
  const d = new Date(toUnixSec(unixSec) * 1000);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function newProfileId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `p_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

export function formatRelative(unixSec: number): string {
  if (!unixSec) return "—";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - toUnixSec(unixSec);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDurationMagnitude(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
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
