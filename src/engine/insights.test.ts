import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultTeams } from '../data/teams.ts';
import { TRACKS } from '../data/tracks.ts';
import { rejoinEstimate } from './insights.ts';
import { runQualifying } from './qualifying.ts';
import { RaceSim, TUNING } from './race.ts';

/** A race run to mid-distance with no incidents, so the order is settled. */
function midRace(): RaceSim {
  const track = TRACKS[0];
  const teams = defaultTeams();
  const target = TUNING as unknown as Record<string, number>;
  const saved = [target.incidentsPerRace, target.failureAtZeroReliability];
  target.incidentsPerRace = 0;
  target.failureAtZeroReliability = 0;
  try {
    const sim = new RaceSim({ track, teams, grid: runQualifying(track, teams, 4).grid, laps: 30, seed: 4, playerTeamId: null });
    sim.start();
    while (sim.standings()[0].lap < 4) sim.step(0.1);
    return sim;
  } finally {
    [target.incidentsPerRace, target.failureAtZeroReliability] = saved;
  }
}

describe('rejoin estimate', () => {
  it('keeps the current place when a stop costs nothing', () => {
    const sim = midRace();
    const car = sim.standings()[4];
    assert.equal(rejoinEstimate(sim, car, 0), 5);
  });

  it('drops one place for each car behind that is closer than the time lost', () => {
    const sim = midRace();
    const order = sim.standings();
    const car = order[4];
    const behind = sim.timeBetween(order[5], car)!;
    const twoBehind = sim.timeBetween(order[6], car)!;
    assert.equal(rejoinEstimate(sim, car, behind + 0.001), 6);
    assert.equal(rejoinEstimate(sim, car, twoBehind + 0.001), 7);
  });

  it('never projects a car below the last running car', () => {
    const sim = midRace();
    const car = sim.standings()[0];
    const running = sim.cars.filter((c) => c.status === 'running').length;
    assert.equal(rejoinEstimate(sim, car, 1e6), running);
  });
});
