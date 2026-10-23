import type { Compound, DryCompound } from './types.ts';

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
  // Wet-weather tyres: their pace depends on the conditions (see weatherPenalty), not on a fixed offset.
  I: { name: 'Intermediate', paceDelta: 0, wearPerLap: 0.03, linear: 1.2, cliff: 30, color: '#2fbf4f' },
  W: { name: 'Wet', paceDelta: 0, wearPerLap: 0.025, linear: 1.0, cliff: 25, color: '#3b8bff' },
};

/** Wear per lap for every compound, given a multiplier for the circuit, car and driver. */
export function scaledWearRates(k: number): Record<Compound, number> {
  return {
    S: COMPOUNDS.S.wearPerLap * k,
    M: COMPOUNDS.M.wearPerLap * k,
    H: COMPOUNDS.H.wearPerLap * k,
    I: COMPOUNDS.I.wearPerLap * k,
    W: COMPOUNDS.W.wearPerLap * k,
  };
}

/** The slicks, in the order the strategy planner tries them. */
export const DRY_COMPOUNDS: readonly DryCompound[] = ['S', 'M', 'H'];
/** Every tyre a pit call can fit. */
export const PIT_COMPOUNDS: readonly Compound[] = ['S', 'M', 'H', 'I', 'W'];

export type TyreClass = 'slick' | 'inter' | 'wet';

export function tyreClass(compound: Compound): TyreClass {
  if (compound === 'I') return 'inter';
  if (compound === 'W') return 'wet';
  return 'slick';
}

/**
 * Seconds a lap a tyre loses to the conditions, on top of the slowdown every
 * car suffers on a wet track. Wetness runs from 0 (dry) to 1 (standing water).
 * Slicks lose time quickly as the track gets wet; intermediates are best on a
 * damp track and overheat on a dry one; full wets only pay off when it is
 * properly wet. The curves cross at about 0.14 (slick to intermediate) and
 * 0.56 (intermediate to wet).
 */
export function weatherPenalty(compound: Compound, wetness: number): number {
  const w = Math.min(1, Math.max(0, wetness));
  const cls = tyreClass(compound);
  if (cls === 'slick') return w === 0 ? 0 : 14 * w ** 1.3;
  if (cls === 'inter') return w < 0.4 ? 2.5 * (1 - w / 0.4) ** 2 : 6 * (w - 0.4) ** 1.5;
  return 5 * Math.max(0, 1 - w / 0.75) ** 2;
}

/** Seconds a lap each class of tyre loses to the conditions right now. */
export function classPenalties(wetness: number): Record<TyreClass, number> {
  return {
    slick: weatherPenalty('M', wetness),
    inter: weatherPenalty('I', wetness),
    wet: weatherPenalty('W', wetness),
  };
}

/**
 * The class of tyre that suits the conditions. Near a crossover the current
 * class is kept unless another is clearly better (by more than `margin`
 * seconds a lap), so cars and prompts do not flip-flop on a small change.
 */
export function bestClass(wetness: number, current?: TyreClass, margin = 0.4): TyreClass {
  const costs = classPenalties(wetness);
  let best: TyreClass = 'slick';
  for (const cls of ['inter', 'wet'] as const) if (costs[cls] < costs[best]) best = cls;
  if (current && costs[current] - costs[best] <= margin) return current;
  return best;
}

/**
 * Wear multiplier from the conditions. Slicks run cooler and wear less on a
 * wet track; intermediates and wets overheat and wear fast on a drying line.
 * Exactly 1 for slicks on a dry track.
 */
export function wetWearFactor(compound: Compound, wetness: number): number {
  const w = Math.min(1, Math.max(0, wetness));
  const cls = tyreClass(compound);
  if (cls === 'slick') return 1 - 0.3 * Math.min(1, w / 0.3);
  if (cls === 'inter') return 1 + (3 * Math.max(0, 0.3 - w)) / 0.3;
  return 1 + (4 * Math.max(0, 0.55 - w)) / 0.55;
}

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
