/**
 * Derived, read-only numbers for the UI: how long tyres and fuel will last,
 * session-best sectors, and strategy validation. Pure functions over the
 * simulation state, so they are easy to test and reuse.
 */

import type { CarState, RaceSim } from './race.ts';
import { TUNING } from './race.ts';
import type { TrackDef } from './track.ts';
import { COMPOUNDS } from './tyres.ts';
import type { Compound, DriverDef, StrategyPlan, TeamDef } from './types.ts';
import type { WearRates } from './strategy.ts';

export const WEAR_LIMIT = 0.97;

export function burnPerLap(sim: RaceSim): number {
  return (TUNING.fuelPerLapRef * sim.track.length) / 5300;
}

/** Tyre wear (fraction of life) consumed per lap right now. */
export function tyreWearRate(sim: RaceSim, car: CarState): number {
  const spec = COMPOUNDS[car.tyre.compound];
  return (
    spec.wearPerLap *
    sim.track.def.tyreSeverity *
    car.wearFactor *
    TUNING.paceMode[car.paceMode].wear
  );
}

/** Laps the current tyres can still run before reaching the wear limit. */
export function tyreLapsLeft(sim: RaceSim, car: CarState): number {
  const rate = tyreWearRate(sim, car);
  return Math.max(0, (WEAR_LIMIT - car.tyre.wear) / rate);
}

/** Laps of fuel beyond what is needed to finish (negative means you will run dry). */
export function fuelLapsSpare(sim: RaceSim, car: CarState): number {
  const perLap =
    burnPerLap(sim) * TUNING.engineMode[car.engineMode].fuel * TUNING.paceMode[car.paceMode].fuel;
  const remaining = sim.totalLaps - car.lap;
  return car.fuel / perLap - remaining;
}

export interface SessionBests {
  sectors: [number, number, number];
  lap: number | null;
}

/** Best sector times and lap across every car (for purple sector colouring). */
export function sessionBests(sim: RaceSim): SessionBests {
  const sectors: [number, number, number] = [Infinity, Infinity, Infinity];
  for (const car of sim.cars) {
    for (const lap of car.laps) {
      if (!lap.clean) continue;
      for (let i = 0; i < 3; i++) sectors[i] = Math.min(sectors[i], lap.sectors[i]);
    }
  }
  return { sectors, lap: sim.fastestLap ? sim.fastestLap.time : null };
}

/** Tyre wear rates per compound for a driver in a team on a given circuit. */
export function wearRatesFor(track: TrackDef, team: TeamDef, driver: DriverDef): WearRates {
  const k =
    track.tyreSeverity *
    (1.1 - (driver.ratings.tyreMgmt / 100) * 0.25) *
    (1.1 - (team.car.chassis / 100) * 0.2);
  return {
    S: COMPOUNDS.S.wearPerLap * k,
    M: COMPOUNDS.M.wearPerLap * k,
    H: COMPOUNDS.H.wearPerLap * k,
  };
}

export interface PlannedStint {
  compound: Compound;
  fromLap: number;
  toLap: number;
  laps: number;
  /** Expected tyre wear at the end of the stint (1 = completely worn). */
  endWear: number;
}

export interface PlanReport {
  stints: PlannedStint[];
  warnings: string[];
  valid: boolean;
}

export interface AnalyseOptions {
  /** First lap of the first stint (default 1). Use the current lap + 1 mid-race. */
  fromLap?: number;
  /** Wear already on the first set of tyres (default 0). */
  startWear?: number;
  /** Compounds already used earlier in the race, for the two-compound rule. */
  alreadyUsed?: readonly Compound[];
}

/** Break a strategy into stints and flag problems (illegal, too long, out of order). */
export function analysePlan(
  plan: StrategyPlan,
  totalLaps: number,
  rates: WearRates,
  opts: AnalyseOptions = {},
): PlanReport {
  const warnings: string[] = [];
  const stops = [...plan.stops].sort((a, b) => a.lap - b.lap);
  const stints: PlannedStint[] = [];
  let from = opts.fromLap ?? 1;
  let wear0 = opts.startWear ?? 0;
  let compound = plan.startCompound;
  for (const stop of stops) {
    const to = Math.min(totalLaps, Math.max(from, stop.lap));
    const laps = to - from + 1;
    stints.push({ compound, fromLap: from, toLap: to, laps, endWear: wear0 + laps * rates[compound] });
    from = to + 1;
    wear0 = 0;
    compound = stop.compound;
  }
  const lastLaps = Math.max(0, totalLaps - from + 1);
  stints.push({ compound, fromLap: from, toLap: totalLaps, laps: lastLaps, endWear: wear0 + lastLaps * rates[compound] });

  const used = new Set<Compound>([...stints.map((s) => s.compound), ...(opts.alreadyUsed ?? [])]);
  if (used.size < 2) warnings.push(`Use at least two different compounds or take a +${TUNING.compoundRulePenalty}s penalty.`);
  stints.forEach((s, i) => {
    if (s.endWear > WEAR_LIMIT) {
      warnings.push(`Stint ${i + 1} (${COMPOUNDS[s.compound].name}) is too long: the tyres will be gone around ${Math.round(s.endWear * 100)}% wear.`);
    }
    if (i > 0 && s.laps < 3) warnings.push(`Stint ${i + 1} is only ${s.laps} laps long.`);
  });
  for (let i = 1; i < stops.length; i++) {
    if (stops[i].lap === stops[i - 1].lap) warnings.push('Two stops are planned on the same lap.');
  }
  for (const s of stops) {
    if (s.lap < 1 || s.lap >= totalLaps) warnings.push(`A stop on lap ${s.lap} is outside the race.`);
  }
  return { stints, warnings, valid: warnings.length === 0 };
}
