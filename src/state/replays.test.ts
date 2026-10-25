import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultTeams } from '../data/teams.ts';
import { TRACKS } from '../data/tracks.ts';
import { runQualifying } from '../engine/qualifying.ts';
import { RaceSim } from '../engine/race.ts';
import type { RaceConfig } from '../engine/race.ts';
import { CommandFeed, STEP_S } from '../engine/replay.ts';
import { checkReplay, clearReplays, loadReplay, replayConfig, replayRecord, replayRounds, saveReplay, saveWithRoom } from './replays.ts';
import type { KeyValue } from './replays.ts';
import { newCareer } from './season.ts';
import type { Career } from './season.ts';

/** In-memory storage that can be told to run out of room. */
function fakeStorage(limit = Infinity): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      const used = [...data].reduce((s, [key, val]) => s + (key === k ? 0 : val.length), 0);
      if (used + v.length > limit) throw new Error('QuotaExceededError');
      data.set(k, v);
    },
    removeItem: (k) => void data.delete(k),
  };
}

const teams = defaultTeams();

function raced(seed = 4): { config: RaceConfig; sim: RaceSim } {
  const track = TRACKS[0];
  // One team with an uploaded logo, which the record must not carry.
  const withLogo = teams.map((t) => (t.id === 'cobalt' ? { ...t, logo: { ...t.logo, imageDataUrl: 'data:image/png;base64,AAAA' } } : t));
  const config: RaceConfig = { track, teams: withLogo, grid: runQualifying(track, withLogo, seed).grid, laps: 25, seed, playerTeamId: 'cobalt' };
  const sim = new RaceSim(config);
  sim.start();
  const feed = new CommandFeed(sim, []);
  for (let n = 0; sim.phase !== 'finished'; n++) {
    if (n === 500) sim.command({ type: 'pace', carId: 'cobalt:0', mode: 'push' });
    if (n === 1800) sim.command({ type: 'pit', carId: 'cobalt:1', compound: 'H' });
    feed.step(STEP_S);
  }
  return { config, sim };
}

const career = (over: Partial<Career> = {}): Career => ({ ...newCareer('cobalt', teams, 77), ...over });

describe('replays', () => {
  it('load back for the same career and season, and for no other', () => {
    const kv = fakeStorage();
    const { config, sim } = raced();
    const c = career();
    assert.equal(saveReplay(c, replayRecord(config, sim, 0), kv), true);
    assert.equal(loadReplay(c, 0, kv)?.round, 0);
    assert.equal(loadReplay(c, 1, kv), null);
    assert.equal(loadReplay({ ...c, seed: 1 }, 0, kv), null);
    assert.equal(loadReplay({ ...c, season: 2 }, 0, kv), null);
  });

  it('list the rounds kept for this season only, with a later save of a round replacing it', () => {
    const kv = fakeStorage();
    const { config, sim } = raced();
    const c = career();
    saveReplay(c, replayRecord(config, sim, 0), kv);
    saveReplay(c, replayRecord(config, sim, 2), kv);
    saveReplay(c, replayRecord(config, sim, 2), kv);
    assert.deepEqual(replayRounds(c, kv), [0, 2]);
    assert.deepEqual(replayRounds({ ...c, season: 2 }, kv), []);
  });

  it("drop last season's replays when the first of a new season is saved", () => {
    const kv = fakeStorage();
    const { config, sim } = raced();
    const c = career();
    saveReplay(c, replayRecord(config, sim, 3), kv);
    const next = { ...c, season: 2 };
    saveReplay(next, replayRecord(config, sim, 0), kv);
    assert.equal(loadReplay(next, 0, kv)?.round, 0);
    assert.equal(loadReplay(c, 3, kv), null);
  });

  it('clear the replays, and touch nothing else, when storage is full', () => {
    const kv = fakeStorage(500);
    kv.setItem('pitwall.career.v2', '{"career":true}');
    const { config, sim } = raced();
    assert.equal(saveReplay(career(), replayRecord(config, sim, 0), kv), false);
    assert.equal(loadReplay(career(), 0, kv), null);
    assert.equal(kv.getItem('pitwall.career.v2'), '{"career":true}');
  });

  it('make room for the career by clearing the replays first', () => {
    const { config, sim } = raced();
    const record = replayRecord(config, sim, 0);
    const size = JSON.stringify(record).length;
    const kv = fakeStorage(size + 400);
    assert.equal(saveReplay(career(), record, kv), true);
    // The career no longer fits beside the replay, so the replay goes and the career is written.
    assert.equal(saveWithRoom(kv, 'pitwall.career.v2', 'x'.repeat(600)), true);
    assert.equal(kv.getItem('pitwall.career.v2')?.length, 600);
    assert.equal(loadReplay(career(), 0, kv), null);
    clearReplays(kv);
  });

  it('store the teams without uploaded logos, and show the editor logo when played', () => {
    const { config, sim } = raced();
    const record = replayRecord(config, sim, 0);
    assert.equal(record.teams.find((t) => t.id === 'cobalt')?.logo.imageDataUrl, undefined);
    const editor = config.teams;
    assert.equal(replayConfig(record, editor).teams.find((t) => t.id === 'cobalt')?.logo.imageDataUrl, 'data:image/png;base64,AAAA');
  });

  it('play back true, and say so when the game no longer reproduces the race', () => {
    const { config, sim } = raced();
    const record = replayRecord(config, sim, 0);
    assert.equal(checkReplay(replayConfig(record, teams), record), true);
    const tampered = { ...record, order: [...record.order].reverse() };
    assert.equal(checkReplay(replayConfig(tampered, teams), tampered), false);
  });

  it('keep the difficulty, so a Hard race plays back as it was run', () => {
    const track = TRACKS[0];
    const config: RaceConfig = { track, teams, grid: runQualifying(track, teams, 8).grid, laps: 25, seed: 8, playerTeamId: 'cobalt', difficulty: 'hard' };
    const sim = new RaceSim(config);
    sim.start();
    const feed = new CommandFeed(sim, []);
    while (sim.phase !== 'finished') feed.step(STEP_S);
    const record = replayRecord(config, sim, 0);
    const played = replayConfig(JSON.parse(JSON.stringify(record)), teams);
    assert.equal(played.difficulty, 'hard');
    assert.equal(checkReplay(played, record), true);
    assert.equal(checkReplay({ ...played, difficulty: 'easy' }, record), false);
  });

  it('keep a 25-lap race with its commands under 20 KB', () => {
    const { config, sim } = raced();
    const size = JSON.stringify(replayRecord(config, sim, 0)).length;
    assert.ok(size < 20_000, `${size} bytes`);
  });
});
