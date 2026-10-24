import type { CarState, RaceSim } from '../engine/race.ts';

/** Two cars running close together, with the place the one behind is chasing. */
export interface Battle {
  ahead: CarState;
  behind: CarState;
  gap: number;
  /** The place being fought for: the position of the car ahead. */
  position: number;
}

/** The battle `car` is in with the car directly ahead, or null when it is not within `maxGap` seconds. */
export function battleFor(sim: RaceSim, car: CarState, maxGap = 1.0): Battle | null {
  if (car.status !== 'running') return null;
  const order = sim.standings();
  const i = order.indexOf(car);
  if (i <= 0) return null;
  const ahead = order[i - 1];
  if (ahead.status !== 'running') return null;
  // A car about to lap another is not racing it.
  if (ahead.dist - car.dist > sim.track.length / 2) return null;
  const gap = sim.gapToAhead(car);
  if (gap === null || gap >= maxGap) return null;
  return { ahead, behind: car, gap, position: i };
}
