const MB = 1024 * 1024;

/** Exponential moving average of the download rate, in bytes per second. */
export function smoothRate(prev: number | null, sample: number, alpha = 0.3): number {
  return prev == null ? sample : prev + alpha * (sample - prev);
}

/** Seconds left at the smoothed rate, or null when it cannot be estimated. */
export function etaSeconds(downloaded: number, total: number | null, rate: number | null): number | null {
  if (total == null || rate == null || rate <= 0 || downloaded >= total) return null;
  return Math.ceil((total - downloaded) / rate);
}

export function toMb(bytes: number): string {
  return (bytes / MB).toFixed(1);
}
