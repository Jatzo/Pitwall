import type { CSSProperties } from 'react';

/** WCAG relative luminance of a six-digit hex colour. */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return 0;
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever reads better on a team colour. */
export function inkFor(hex: string): string {
  if (Number.isNaN(Number.parseInt(hex.replace('#', ''), 16))) return '#ffffff';
  // Contrast against black beats contrast against white above about 0.18.
  return luminance(hex) > 0.18 ? '#07080b' : '#ffffff';
}

/** Inline style that sets one CSS custom property, for colours that come from data (team and tyre colours). */
export function cssVar(name: `--${string}`, value: string): CSSProperties {
  return { [name]: value } as CSSProperties;
}
