/**
 * Key moments that pause the race so the player can make a call: a safety
 * car, or damage to one of their cars. Kept free of React so the rules can be
 * tested in Node.
 */

import type { CarState, RaceSim } from '../engine/race.ts';

export interface MomentWatch {
  scCount: number;
  damage: Map<string, number>;
}

export interface Moment {
  kind: 'safetycar' | 'damage';
  /** The damaged car, for damage moments. */
  carId?: string;
}

/** Tyres younger than this gain nothing from a safety car stop. */
const MIN_TYRE_AGE_FOR_SC_STOP = 2;

/** Player cars that have a real pit call to make for this moment. */
export function promptCars(sim: RaceSim, moment: Moment): CarState[] {
  return sim.cars.filter(
    (car) =>
      car.isPlayer &&
      !car.auto &&
      car.status === 'running' &&
      // A stop needs the pit entry of a lap that is not the last.
      sim.totalLaps - car.lap > 1 &&
      (moment.kind === 'damage' ? car.id === moment.carId : car.tyre.ageLaps >= MIN_TYRE_AGE_FOR_SC_STOP),
  );
}

/** Remember what has already been seen, so only new moments are reported. */
export function watchMoments(sim: RaceSim): MomentWatch {
  return { scCount: sim.scCount, damage: new Map(sim.cars.map((c) => [c.id, c.damage])) };
}

/**
 * The first moment since the last call, or null. Always updates the watch, so
 * a moment that arrives while no decision is possible is not reported later.
 */
export function nextMoment(sim: RaceSim, watch: MomentWatch): Moment | null {
  let moment: Moment | null = null;
  if (sim.scCount > watch.scCount) moment = { kind: 'safetycar' };
  watch.scCount = sim.scCount;
  for (const car of sim.cars) {
    const before = watch.damage.get(car.id) ?? 0;
    if (car.isPlayer && car.damage > before + 1e-9 && moment === null) moment = { kind: 'damage', carId: car.id };
    watch.damage.set(car.id, car.damage);
  }
  return moment !== null && promptCars(sim, moment).length > 0 ? moment : null;
}
