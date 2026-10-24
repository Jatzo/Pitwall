/** Formatting helpers for lap times, gaps and speeds. */

/** Lap time, e.g. "1:24.512". */
export function formatLap(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

/** Gap in seconds, e.g. "+1.234". Gaps of a minute or more use m:ss.mmm. */
export function formatGap(seconds: number | null): string {
  if (seconds === null || Number.isNaN(seconds)) return '--';
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    return `+${m}:${(seconds - m * 60).toFixed(3).padStart(6, '0')}`;
  }
  return `+${seconds.toFixed(3)}`;
}

/** Sector time, e.g. "28.412". */
export function formatSector(seconds: number | null): string {
  if (seconds === null || Number.isNaN(seconds)) return '--.---';
  return seconds.toFixed(3);
}

/** Total race time, e.g. "1:24:36.512", or "33:07.424" under an hour. */
export function formatRaceTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds - h * 3600) / 60);
  const s = seconds - h * 3600 - m * 60;
  const rest = s.toFixed(3).padStart(6, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}

export function mpsToKph(v: number): number {
  return v * 3.6;
}

/** 1st, 2nd, 3rd, 4th, 11th, 21st. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
