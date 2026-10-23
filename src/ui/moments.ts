/**
 * Key moments that pause the race so the player can make a call: a safety
 * car, damage to one of their cars, rain starting, or the conditions turning
 * in favour of another class of tyre. Kept free of React so the rules can be
 * tested in Node.
 */

import type { CarState, RaceSim } from '../engine/race.ts';
import { bestClass, tyreClass } from '../engine/tyres.ts';
import type { TyreClass } from '../engine/tyres.ts';
import { RAIN_THRESHOLD } from '../engine/weather.ts';

export interface MomentWatch {
  scCount: number;
  damage: Map<string, number>;
  raining: boolean;
  /** The tyre class last suggested to each player car. */
  advice: Map<string, TyreClass>;
}

export interface Moment {
  kind: 'safetycar' | 'damage' | 'rain' | 'conditions';
  /** The car concerned, for damage and conditions moments. */
  carId?: string;
}

/** Tyres younger than this gain little from a safety car stop; the prompt says so. */
export const MIN_TYRE_AGE_FOR_SC_STOP = 2;

/** Player cars that have a real pit call to make for this moment. */
export function promptCars(sim: RaceSim, moment: Moment): CarState[] {
  return sim.cars.filter(
    (car) =>
      car.isPlayer &&
      !car.auto &&
      car.status === 'running' &&
      // A stop needs the pit entry of a lap that is not the last.
      sim.totalLaps - car.lap > 1 &&
      // Every safety car asks, even on fresh tyres: a safety car with no call reads as a fault.
      (moment.kind === 'rain' || moment.kind === 'safetycar' || car.id === moment.carId),
  );
}

/** The class of tyre that suits the racing line now, given what the car has on. */
function adviceFor(sim: RaceSim, car: CarState): TyreClass {
  return bestClass(sim.wetness, tyreClass(car.tyre.compound));
}

/** Remember what has already been seen, so only new moments are reported. */
export function watchMoments(sim: RaceSim): MomentWatch {
  return {
    scCount: sim.scCount,
    damage: new Map(sim.cars.map((c) => [c.id, c.damage])),
    raining: sim.rain > RAIN_THRESHOLD,
    advice: new Map(sim.cars.filter((c) => c.isPlayer).map((c) => [c.id, adviceFor(sim, c)])),
  };
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
  const raining = sim.rain > RAIN_THRESHOLD;
  if (raining && !watch.raining && moment === null) moment = { kind: 'rain' };
  watch.raining = raining;
  if (moment !== null) return promptCars(sim, moment).length > 0 ? moment : null;

  // One car at a time, so each player car gets its own call.
  for (const car of sim.cars.filter((c) => c.isPlayer)) {
    const advice = adviceFor(sim, car);
    if (advice === watch.advice.get(car.id)) continue;
    watch.advice.set(car.id, advice);
    const conditions: Moment = { kind: 'conditions', carId: car.id };
    if (advice !== tyreClass(car.tyre.compound) && promptCars(sim, conditions).length > 0) return conditions;
  }
  return null;
}
