import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultTeams } from '../data/teams.ts';
import { TRACKS } from '../data/tracks.ts';
import { runQualifying } from '../engine/qualifying.ts';
import { RaceSim } from '../engine/race.ts';
import { raceCharts } from './raceCharts.ts';

function finished(playerTeamId: string, seed = 3, laps = 25): RaceSim {
  const teams = defaultTeams();
  const track = TRACKS[0];
  const sim = new RaceSim({ track, teams, grid: runQualifying(track, teams, seed).grid, laps, seed, playerTeamId });
  sim.start();
  while (sim.phase !== 'finished') sim.step(0.1);
  return sim;
}

describe('race charts', () => {
  it("draws the player's two cars in seat order, then the winner", () => {
    const sim = finished('cobalt');
    const charts = raceCharts(sim, 'cobalt');
    const winner = sim.results()[0].carId;
    assert.deepEqual(charts.lapSeries.map((s) => s.carId), ['cobalt:0', 'cobalt:1', winner]);
    assert.deepEqual(charts.lapSeries.map((s) => s.slot), [1, 2, 3]);
    // Tyre wear is the player's business only.
    assert.deepEqual(charts.wearSeries.map((s) => s.carId), ['cobalt:0', 'cobalt:1']);
    assert.equal(charts.wearSeries[0].slot, 1);
  });

  it('does not draw the winner twice when a player car won', () => {
    const sim = finished('aurora');
    const winner = sim.results()[0].carId;
    const team = winner.split(':')[0];
    const charts = raceCharts(sim, team);
    assert.equal(charts.lapSeries.length, 2);
    assert.ok(charts.lapSeries.some((s) => s.carId === winner && s.won));
  });

  it('carries every lap with its wear, and scales lap times to the racing laps', () => {
    const sim = finished('cobalt');
    const charts = raceCharts(sim, 'cobalt');
    const car = sim.carById('cobalt:0')!;
    assert.deepEqual(charts.lapSeries[0].laps.map((l) => l.wear), car.laps.map((l) => l.wear));
    const all = charts.lapSeries.flatMap((s) => s.laps);
    const clean = all.filter((l) => !l.pit && !l.safetyCar && l.lap > 1).map((l) => l.time);
    const [lo, hi] = charts.lapDomain;
    assert.ok(lo <= Math.min(...clean) && hi >= Math.min(...clean));
    // A pit lap is far slower than any racing lap, so it sits off the top rather than flattening the rest.
    const pitLap = Math.max(...all.filter((l) => l.pit).map((l) => l.time));
    assert.ok(pitLap > hi, `pit lap ${pitLap} against top of scale ${hi}`);
    assert.equal(charts.totalLaps, sim.totalLaps);
  });
});
