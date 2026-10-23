import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RaceSim } from '../engine/race.ts';
import { Track } from '../engine/track.ts';
import { defaultTeams } from './teams.ts';
import { SEASON_CALENDAR, TRACKS, fullRaceLaps, trackById } from './tracks.ts';

describe('circuits', () => {
  it('have unique ids and names, a summary, and weights that add up to one', () => {
    assert.equal(new Set(TRACKS.map((t) => t.id)).size, TRACKS.length);
    assert.equal(new Set(TRACKS.map((t) => t.name)).size, TRACKS.length);
    for (const t of TRACKS) {
      assert.ok(t.summary && t.summary.length > 10, `${t.id} needs a summary`);
      assert.ok(t.rainChance !== undefined && t.rainChance >= 0 && t.rainChance <= 0.6, `${t.id} needs a chance of rain`);
      const sum = t.weights.power + t.weights.aero + t.weights.chassis;
      assert.ok(Math.abs(sum - 1) < 1e-9, `${t.id} weights sum to ${sum}`);
    }
  });

  it('run about 305 km at full distance', () => {
    for (const t of TRACKS) {
      const km = (fullRaceLaps(t) * t.lengthM) / 1000;
      assert.ok(km >= 305 && km < 310, `${t.id}: ${km} km`);
    }
  });

  it('make a season of 8 to 12 different rounds', () => {
    assert.ok(SEASON_CALENDAR.length >= 8 && SEASON_CALENDAR.length <= 12);
    assert.equal(new Set(SEASON_CALENDAR).size, SEASON_CALENDAR.length);
    for (const id of SEASON_CALENDAR) assert.ok(trackById(id));
  });

  it('cover a range of speeds, from a slow street circuit to a fast one', () => {
    const speeds = TRACKS.map((t) => new Track(t).refAvgKph);
    assert.ok(Math.max(...speeds) - Math.min(...speeds) > 50, `range ${Math.min(...speeds)} to ${Math.max(...speeds)}`);
  });

  for (const def of TRACKS) {
    it(`hold a short race at ${def.name} with every car classified`, () => {
      const teams = defaultTeams();
      const grid = teams.flatMap((t) => [`${t.id}:0`, `${t.id}:1`]);
      const sim = new RaceSim({ track: def, teams, grid, laps: 8, seed: 11, playerTeamId: null });
      sim.start();
      for (let i = 0; i < 200_000 && sim.phase !== 'finished'; i++) sim.step(0.1);
      assert.equal(sim.phase, 'finished');
      for (const row of sim.results()) {
        if (row.finished) assert.ok(Number.isFinite(row.timeS) && row.bestLap !== null && Number.isFinite(row.bestLap), `${row.carId} timing`);
      }
    });
  }
});
