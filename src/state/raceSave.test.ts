import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultTeams } from '../data/teams.ts';
import { TRACKS } from '../data/tracks.ts';
import { runQualifying } from '../engine/qualifying.ts';
import { RaceSim } from '../engine/race.ts';
import type { RaceConfig } from '../engine/race.ts';
import { CommandFeed, STEP_S } from '../engine/replay.ts';
import { fakeStorage } from './fixtures/fakeStorage.ts';
import { RACE_KEY, clearRace, loadRace, resumeRace, saveRace } from './raceSave.ts';
import { REPLAYS_KEY, saveWithRoom } from './replays.ts';
import { newCareer } from './season.ts';
import type { Career } from './season.ts';

const teams = defaultTeams();
const career = newCareer('cobalt', teams, 77);

function config(seed = 4): RaceConfig {
  const track = TRACKS[0];
  return { track, teams, grid: runQualifying(track, teams, seed).grid, laps: 20, seed, playerTeamId: 'cobalt' };
}

/** A race run to `steps` with an order on the way, as the race screen runs it. */
function raceTo(cfg: RaceConfig, steps: number): RaceSim {
  const sim = new RaceSim(cfg);
  sim.start();
  const feed = new CommandFeed(sim, []);
  for (let n = 0; n < steps && sim.phase === 'racing'; n++) {
    if (n === 300) sim.command({ type: 'pace', carId: 'cobalt:0', mode: 'push' });
    feed.step(STEP_S);
  }
  return sim;
}

describe('race in progress', () => {
  it('saves and resumes to the same point, with the orders given so far', () => {
    const kv = fakeStorage();
    const cfg = config();
    const sim = raceTo(cfg, 1200);
    assert.equal(saveRace(career, cfg, sim, 1200, kv), true);
    const save = loadRace(career, kv);
    assert.ok(save);
    const resumed = resumeRace(save, teams);
    assert.ok(resumed);
    assert.equal(resumed.sim.time, sim.time);
    assert.deepEqual(
      resumed.sim.standings().map((c) => [c.id, c.lap]),
      sim.standings().map((c) => [c.id, c.lap]),
    );
    assert.equal(resumed.sim.carById('cobalt:0')?.paceMode, 'push');
  });

  it('resumes a race left the moment the lights went out on the grid, ready to start again', () => {
    const kv = fakeStorage();
    const cfg = config();
    const sim = new RaceSim(cfg);
    sim.start();
    saveRace(career, cfg, sim, 0, kv);
    const save = loadRace(career, kv);
    assert.ok(save);
    assert.equal(resumeRace(save, teams)?.sim.phase, 'grid');
  });

  it('belongs to one career, season and round, and reads a damaged save as none', () => {
    const kv = fakeStorage();
    const cfg = config();
    saveRace(career, cfg, raceTo(cfg, 50), 50, kv);
    assert.ok(loadRace(career, kv));
    assert.equal(loadRace({ ...career, seed: 1 }, kv), null);
    assert.equal(loadRace({ ...career, season: 2 }, kv), null);
    assert.equal(loadRace({ ...career, results: [...career.results, { round: 0 } as Career['results'][number]] }, kv), null);
    kv.setItem(RACE_KEY, '{not json');
    assert.equal(loadRace(career, kv), null);
    clearRace(kv);
    assert.equal(kv.getItem(RACE_KEY), null);
  });

  it('will not resume a race that this version of the game plays out differently', () => {
    const kv = fakeStorage();
    const cfg = config();
    saveRace(career, cfg, raceTo(cfg, 600), 600, kv);
    const save = loadRace(career, kv);
    assert.ok(save);
    assert.equal(resumeRace({ ...save, check: save.check + 1 }, teams), null);
    assert.equal(resumeRace({ ...save, record: { ...save.record, trackId: 'no-such-track' } }, teams), null);
  });

  it('is never saved once the race is finished', () => {
    const kv = fakeStorage();
    const cfg = config();
    const sim = raceTo(cfg, Infinity);
    assert.equal(sim.phase, 'finished');
    assert.equal(saveRace(career, cfg, sim, 1, kv), false);
    assert.equal(kv.getItem(RACE_KEY), null);
  });

  it('gives way to the career: replays go first, then the race, when storage is full', () => {
    const kv = fakeStorage(1000);
    kv.setItem(REPLAYS_KEY, 'r'.repeat(300));
    kv.setItem(RACE_KEY, 'g'.repeat(300));
    const spare = [REPLAYS_KEY, RACE_KEY];
    assert.equal(saveWithRoom(kv, 'career', 'c'.repeat(600), spare), true);
    assert.equal(kv.getItem(REPLAYS_KEY), null);
    assert.equal(kv.getItem(RACE_KEY)?.length, 300, 'the race stays while there is room for it');
    assert.equal(saveWithRoom(kv, 'career', 'c'.repeat(900), spare), true);
    assert.equal(kv.getItem(RACE_KEY), null);
    assert.equal(saveWithRoom(kv, 'career', 'c'.repeat(1100), spare), false);
  });
});
