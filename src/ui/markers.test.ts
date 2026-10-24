import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultTeams } from '../data/teams.ts';
import { TRACKS } from '../data/tracks.ts';
import { runQualifying } from '../engine/qualifying.ts';
import { RaceSim } from '../engine/race.ts';
import type { CarState } from '../engine/race.ts';
import { carPose } from './markers.ts';

function startedSim(): RaceSim {
  const track = TRACKS[0];
  const teams = defaultTeams();
  const sim = new RaceSim({ track, teams, grid: runQualifying(track, teams, 3).grid, laps: 20, seed: 3, playerTeamId: teams[5].id });
  sim.start();
  for (let i = 0; i < 300; i++) sim.step(0.1);
  return sim;
}

function garages(sim: RaceSim): string[] {
  return [...new Set(sim.cars.map((c) => c.team.id))];
}

/**
 * How far, in degrees, the marker points away from the way the car moves
 * across one step, or null when it hardly moved. The chord between the start
 * and end of a step runs parallel to the path at its middle, so that is where
 * the marker's direction is read.
 */
function error(sim: RaceSim, car: CarState): number | null {
  const g = garages(sim);
  const a = carPose(sim, car, 0, g);
  const mid = carPose(sim, car, 0.5, g);
  const b = carPose(sim, car, 1, g);
  if (Math.hypot(b.x - a.x, b.y - a.y) < 0.5) return null;
  let d = Math.atan2(b.y - a.y, b.x - a.x) - mid.heading;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return (Math.abs(d) * 180) / Math.PI;
}

describe('car markers', () => {
  it('point the way the car travels on the racing line', () => {
    const sim = startedSim();
    let worst = 0;
    let samples = 0;
    for (let i = 0; i < 600; i++) {
      sim.step(0.1);
      for (const car of sim.cars) {
        if (car.status !== 'running') continue;
        const e = error(sim, car);
        if (e === null) continue;
        worst = Math.max(worst, e);
        samples++;
      }
    }
    assert.ok(samples > 5000, `${samples} samples`);
    assert.ok(worst < 12, `points ${worst.toFixed(1)} degrees off`);
  });

  it('point along the pit lane, where it bends away from the track', () => {
    const sim = startedSim();
    const car = sim.cars.find((c) => c.isPlayer)!;
    sim.command({ type: 'pit', carId: car.id, compound: 'H' });
    let worst = 0;
    let samples = 0;
    let wasInLane = false;
    for (let i = 0; i < 3000; i++) {
      sim.step(0.1);
      const inLane = car.status === 'pitLane';
      // Only whole steps on the lane: the step that turns in starts on the track.
      if (inLane && wasInLane) {
        const e = error(sim, car);
        if (e !== null) {
          worst = Math.max(worst, e);
          samples++;
        }
      }
      if (wasInLane && !inLane) break;
      wasInLane = inLane;
    }
    assert.ok(samples > 20, `${samples} samples on the pit lane`);
    assert.ok(worst < 12, `points ${worst.toFixed(1)} degrees off on the pit lane`);
  });
});
