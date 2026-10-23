/**
 * Qualifying: a three-part knockout (Q1/Q2/Q3) built from the same pace model
 * as the race, with low fuel, soft tyres and a little randomness per run.
 */

import { Rng, mixSeed } from './rng.ts';
import { TUNING, carId } from './race.ts';
import { Track } from './track.ts';
import type { TrackDef } from './track.ts';
import { COMPOUNDS } from './tyres.ts';
import type { TeamDef } from './types.ts';

export interface QualifyingRow {
  carId: string;
  position: number;
  q1: number | null;
  q2: number | null;
  q3: number | null;
  /** Best time across the sessions the car took part in. */
  best: number;
}

export interface QualifyingResult {
  rows: QualifyingRow[];
  /** Car ids, pole position first. */
  grid: string[];
}

const SESSION_GAIN = 0.12; // track improves between sessions (seconds)
const QUALI_FUEL_KG = 6;

export function runQualifying(track: TrackDef, teams: readonly TeamDef[], seed: number): QualifyingResult {
  const geom = new Track(track);
  const w = track.weights;

  interface Entrant {
    id: string;
    base: number;
    sigma: number;
    q1: number | null;
    q2: number | null;
    q3: number | null;
    rng: Rng;
  }

  const entrants: Entrant[] = [];
  for (const team of teams) {
    const perf = team.car.power * w.power + team.car.aero * w.aero + team.car.chassis * w.chassis;
    team.drivers.forEach((driver, i) => {
      const id = carId(team, i as 0 | 1);
      entrants.push({
        id,
        base:
          geom.refLap +
          (100 - perf) * TUNING.carSecPerPoint +
          (100 - driver.ratings.pace) * TUNING.driverSecPerPoint +
          COMPOUNDS.S.paceDelta +
          QUALI_FUEL_KG * TUNING.fuelSecPerKg +
          TUNING.engineMode.rich.pace,
        sigma: 0.07 + (100 - driver.ratings.consistency) * 0.006,
        q1: null,
        q2: null,
        q3: null,
        rng: new Rng(mixSeed(seed, `quali:${id}`)),
      });
    });
  }

  const attempt = (e: Entrant, session: number): number => {
    // Two flying laps; the best counts. Occasional mistakes cost time.
    let best = Infinity;
    for (let run = 0; run < 2; run++) {
      let t = e.base - session * SESSION_GAIN + Math.abs(e.rng.normal(0, e.sigma));
      if (e.rng.chance(0.04)) t += e.rng.range(0.4, 1.2);
      best = Math.min(best, t);
    }
    return best;
  };

  const sortBy = (list: Entrant[], key: 'q1' | 'q2' | 'q3'): Entrant[] =>
    [...list].sort((a, b) => (a[key] ?? Infinity) - (b[key] ?? Infinity));

  const all = entrants;
  for (const e of all) e.q1 = attempt(e, 0);
  const afterQ1 = sortBy(all, 'q1');
  const cut1 = Math.max(10, Math.ceil(all.length * 0.75));
  const inQ2 = afterQ1.slice(0, cut1);
  const outQ1 = afterQ1.slice(cut1);

  for (const e of inQ2) e.q2 = attempt(e, 1);
  const afterQ2 = sortBy(inQ2, 'q2');
  const cut2 = Math.max(5, Math.ceil(all.length * 0.5));
  const inQ3 = afterQ2.slice(0, cut2);
  const outQ2 = afterQ2.slice(cut2);

  for (const e of inQ3) e.q3 = attempt(e, 2);
  const afterQ3 = sortBy(inQ3, 'q3');

  const ordered = [...afterQ3, ...outQ2, ...outQ1];
  const rows: QualifyingRow[] = ordered.map((e, i) => ({
    carId: e.id,
    position: i + 1,
    q1: e.q1,
    q2: e.q2,
    q3: e.q3,
    best: e.q3 ?? e.q2 ?? (e.q1 as number),
  }));
  return { rows, grid: ordered.map((e) => e.id) };
}
