/**
 * Pit strategy planning.
 *
 * Given how fast each compound wears, the planner enumerates every stop count
 * and compound sequence that can cover the remaining laps, allocates laps to
 * each stint by greedy water-filling on marginal lap cost (the cost curves are
 * convex, so this is optimal), adds the pit loss, and picks the cheapest plan.
 * The same planner drives AI teams, replans after unscheduled stops and the
 * "suggest strategy" button in the UI.
 */

import type { Rng } from './rng.ts';
import { ALL_COMPOUNDS, COMPOUNDS, tyrePenalty } from './tyres.ts';
import type { Compound, PlannedStop, StrategyPlan } from './types.ts';

export type WearRates = Record<Compound, number>;

export interface PlanContext {
  /** Laps still to run, including the one in progress. */
  lapsRemaining: number;
  /** Laps already completed. Stop laps in the result are absolute. */
  lapsCompleted: number;
  /** Fraction of tyre life consumed per lap, per compound. */
  wearRates: WearRates;
  /** Time lost by a pit stop, in seconds. */
  pitLoss: number;
  /** Compound currently fitted, or null if the start compound is free. */
  currentCompound: Compound | null;
  /** Wear already on the current tyre (0..1). */
  currentWear: number;
  /** Compounds already used in this race. */
  used: readonly Compound[];
  /** Random variation (seconds of cost jitter) so AI teams diverge. */
  jitter?: { rng: Rng; seconds: number };
}

const WEAR_LIMIT = 0.97;
const MAX_STOPS = 3;
const MIN_STINT = 3;
// Planning cost for ignoring the two-compound rule. Deliberately higher than the
// real 30 s penalty: it is a rule the AI should respect, not a trade-off to gamble on.
const RULE_PENALTY = 60;

function stintLapCost(compound: Compound, wearRate: number, startWear: number, lapIndex: number): number {
  const wear = startWear + wearRate * (lapIndex + 0.5);
  return COMPOUNDS[compound].paceDelta + tyrePenalty(compound, wear);
}

function maxStintLaps(wearRate: number, startWear: number): number {
  return Math.max(0, Math.floor((WEAR_LIMIT - startWear) / wearRate));
}

/** Every compound sequence of the given length, optionally with a fixed first tyre. */
function* sequences(length: number, first: Compound | null): Generator<Compound[]> {
  const extend = function* (prefix: Compound[]): Generator<Compound[]> {
    if (prefix.length === length) {
      yield prefix;
      return;
    }
    for (const c of ALL_COMPOUNDS) yield* extend([...prefix, c]);
  };
  yield* extend(first ? [first] : []);
}

interface Option {
  seq: Compound[];
  lens: number[];
  cost: number;
}

function evaluate(seq: Compound[], ctx: PlanContext): Option | null {
  const startWear = (i: number): number => (i === 0 ? ctx.currentWear : 0);
  const maxes = seq.map((c, i) => maxStintLaps(ctx.wearRates[c], startWear(i)));
  if (maxes.reduce((a, b) => a + b, 0) < ctx.lapsRemaining) return null;

  const lens = seq.map(() => 0);
  let cost = 0;
  for (let lap = 0; lap < ctx.lapsRemaining; lap++) {
    let best = -1;
    let bestMarginal = Infinity;
    for (let i = 0; i < seq.length; i++) {
      if (lens[i] >= maxes[i]) continue;
      const m = stintLapCost(seq[i], ctx.wearRates[seq[i]], startWear(i), lens[i]);
      if (m < bestMarginal) {
        bestMarginal = m;
        best = i;
      }
    }
    if (best < 0) return null;
    lens[best]++;
    cost += bestMarginal;
  }
  // Every stint after the first must exist and be long enough to justify a stop.
  if (lens.some((l, i) => i > 0 && l < MIN_STINT)) return null;

  cost += (seq.length - 1) * ctx.pitLoss;
  const all = new Set<Compound>([...ctx.used, ...seq]);
  if (all.size < 2) cost += RULE_PENALTY;
  if (ctx.jitter) cost += ctx.jitter.rng.normal(0, ctx.jitter.seconds);
  return { seq, lens, cost };
}

export function planStrategy(ctx: PlanContext): StrategyPlan {
  let best: Option | null = null;
  for (let stops = 0; stops <= MAX_STOPS; stops++) {
    for (const seq of sequences(stops + 1, ctx.currentCompound)) {
      const option = evaluate(seq, ctx);
      if (option && (!best || option.cost < best.cost)) best = option;
    }
  }

  if (!best) {
    // Nothing fits within the wear limit (very long race on poor tyres):
    // run hards and stop as late as the limit allows.
    const start = ctx.currentCompound ?? 'H';
    const first = Math.max(MIN_STINT, maxStintLaps(ctx.wearRates[start], ctx.currentWear));
    const stops: PlannedStop[] = [];
    let lap = ctx.lapsCompleted + first;
    const finish = ctx.lapsCompleted + ctx.lapsRemaining;
    while (lap < finish - 2) {
      stops.push({ lap, compound: 'H' });
      lap += Math.max(MIN_STINT, maxStintLaps(ctx.wearRates.H, 0));
    }
    return { startCompound: start, stops };
  }

  const stops: PlannedStop[] = [];
  let lap = ctx.lapsCompleted;
  for (let i = 0; i < best.seq.length - 1; i++) {
    lap += best.lens[i];
    stops.push({ lap, compound: best.seq[i + 1] });
  }
  return { startCompound: best.seq[0], stops };
}

/** Shift stop laps by a little so rival teams do not all pit on the same lap. */
export function jitterStops(
  plan: StrategyPlan,
  rng: Rng,
  spread: number,
  minLap: number,
  maxLap: number,
): StrategyPlan {
  let prev = minLap - MIN_STINT;
  const stops = plan.stops.map((s) => {
    const lap = Math.min(maxLap, Math.max(prev + MIN_STINT, s.lap + rng.int(-spread, spread)));
    prev = lap;
    return { ...s, lap };
  });
  return { ...plan, stops };
}
