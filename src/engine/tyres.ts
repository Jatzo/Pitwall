import type { Compound } from './types.ts';

export interface CompoundSpec {
  name: string;
  /** Lap-time offset versus a fresh medium, in seconds. */
  paceDelta: number;
  /** Fraction of tyre life consumed per lap on an average track. */
  wearPerLap: number;
  /** Seconds lost per lap at 100% wear from steady degradation. */
  linear: number;
  /** Extra "cliff" coefficient once wear passes CLIFF_START. */
  cliff: number;
  color: string;
}

export const CLIFF_START = 0.72;

/**
 * Calibrated so that, over a ~305 km race, a medium-to-hard one-stop is
 * usually fastest while softs reward short stints and aggressive strategies.
 */
export const COMPOUNDS: Record<Compound, CompoundSpec> = {
  S: { name: 'Soft', paceDelta: -0.6, wearPerLap: 0.062, linear: 2.6, cliff: 60, color: '#ff3b3b' },
  M: { name: 'Medium', paceDelta: 0, wearPerLap: 0.033, linear: 1.1, cliff: 32, color: '#ffd23f' },
  H: { name: 'Hard', paceDelta: 0.55, wearPerLap: 0.023, linear: 0.8, cliff: 24, color: '#f2f2f2' },
};

export const ALL_COMPOUNDS: readonly Compound[] = ['S', 'M', 'H'];

/**
 * Seconds lost per lap because of tyre wear. Roughly linear while the tyre is
 * healthy, then a quadratic "cliff" once it is worn past CLIFF_START.
 */
export function tyrePenalty(compound: Compound, wear: number): number {
  const spec = COMPOUNDS[compound];
  const w = Math.max(0, wear);
  const over = Math.max(0, w - CLIFF_START);
  return spec.linear * w + spec.cliff * over * over;
}
