import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultTeams } from '../data/teams.ts';
import { TRACKS } from '../data/tracks.ts';
import { runQualifying } from './qualifying.ts';
import { RaceSim } from './race.ts';
import type { RaceConfig } from './race.ts';
import { CommandFeed, STEP_S, replayRace } from './replay.ts';
import type { RaceCommand } from './types.ts';

function config(seed = 5): RaceConfig {
  const teams = defaultTeams();
  const track = TRACKS[0];
  return { track, teams, grid: runQualifying(track, teams, seed).grid, laps: 25, seed, playerTeamId: 'cobalt' };
}

/** Runs a race the way the race screen does, giving commands between steps at chosen step counts. */
function playLive(cfg: RaceConfig, orders: Record<number, RaceCommand>): RaceSim {
  const sim = new RaceSim(cfg);
  // A command on the grid, before the lights.
  sim.command({ type: 'engine', carId: 'cobalt:1', mode: 'lean' });
  sim.start();
  const feed = new CommandFeed(sim, []);
  for (let n = 0; sim.phase !== 'finished'; n++) {
    if (orders[n]) sim.command(orders[n]);
    feed.step(STEP_S);
  }
  return sim;
}

const laps = (sim: RaceSim) => sim.cars.map((c) => ({ id: c.id, laps: c.laps, stops: c.stops.length, status: c.status }));

describe('replays', () => {
  it('replay a race with its commands to the same result, lap for lap', () => {
    const cfg = config();
    const live = playLive(cfg, {
      40: { type: 'pace', carId: 'cobalt:0', mode: 'push' },
      900: { type: 'plan', carId: 'cobalt:0', plan: { startCompound: 'M', stops: [{ lap: 14, compound: 'H' }] } },
      2400: { type: 'pit', carId: 'cobalt:1', compound: 'S' },
      3300: { type: 'auto', carId: 'cobalt:1', enabled: true },
    });
    assert.ok(live.commandLog.length >= 5, 'every command was logged');
    const again = replayRace(cfg, live.commandLog);
    assert.deepEqual(again.results(), live.results());
    assert.deepEqual(laps(again), laps(live));
    // Without the commands the race comes out differently, so the test is not passing by luck.
    assert.notDeepEqual(laps(replayRace(cfg, [])), laps(live));
  });

  it('keeps a copy of each command, so a later change to it cannot rewrite the log', () => {
    const sim = new RaceSim(config());
    sim.start();
    const plan = { startCompound: 'M' as const, stops: [{ lap: 10, compound: 'H' as const }] };
    sim.command({ type: 'plan', carId: 'cobalt:0', plan });
    plan.stops[0].lap = 3;
    const logged = sim.commandLog[0].cmd as Extract<RaceCommand, { type: 'plan' }>;
    assert.equal(logged.plan.stops[0].lap, 10);
  });
});
