import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultTeams } from '../data/teams.ts';
import { TRACKS } from '../data/tracks.ts';
import { runQualifying } from '../engine/qualifying.ts';
import { RaceSim } from '../engine/race.ts';
import { nextMoment, promptCars, watchMoments } from './moments.ts';

function startedSim(): RaceSim {
  const track = TRACKS[0];
  const teams = defaultTeams();
  const sim = new RaceSim({ track, teams, grid: runQualifying(track, teams, 3).grid, laps: 20, seed: 3, playerTeamId: teams[5].id });
  sim.start();
  for (let i = 0; i < 2000; i++) sim.step(0.1);
  return sim;
}

describe('key moments', () => {
  it('reports nothing while nothing has changed', () => {
    const sim = startedSim();
    const watch = watchMoments(sim);
    assert.equal(nextMoment(sim, watch), null);
  });

  it('reports a new safety car once', () => {
    const sim = startedSim();
    const watch = watchMoments(sim);
    sim.scCount++;
    assert.equal(nextMoment(sim, watch)?.kind, 'safetycar');
    assert.equal(nextMoment(sim, watch), null);
  });

  it('reports new damage on a player car, but not on a rival', () => {
    const sim = startedSim();
    const watch = watchMoments(sim);
    const rival = sim.cars.find((c) => !c.isPlayer)!;
    rival.damage += 1;
    assert.equal(nextMoment(sim, watch), null);
    const mine = sim.cars.find((c) => c.isPlayer && c.status === 'running')!;
    mine.damage += 1;
    const moment = nextMoment(sim, watch);
    assert.equal(moment?.kind, 'damage');
    assert.equal(moment?.carId, mine.id);
  });

  it('does not offer a safety car stop on tyres that are almost new', () => {
    const sim = startedSim();
    const watch = watchMoments(sim);
    for (const car of sim.cars.filter((c) => c.isPlayer)) car.tyre.ageLaps = 1;
    sim.scCount++;
    assert.equal(nextMoment(sim, watch), null);
    for (const car of sim.cars.filter((c) => c.isPlayer)) car.tyre.ageLaps = 3;
    sim.scCount++;
    assert.equal(nextMoment(sim, watch)?.kind, 'safetycar');
  });

  it('stays quiet when no player car can still make a decision', () => {
    const sim = startedSim();
    const watch = watchMoments(sim);
    for (const car of sim.cars.filter((c) => c.isPlayer)) car.auto = true;
    assert.deepEqual(promptCars(sim, { kind: 'safetycar' }), []);
    sim.scCount++;
    assert.equal(nextMoment(sim, watch), null);
  });
});
