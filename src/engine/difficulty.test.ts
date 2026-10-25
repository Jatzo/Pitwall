import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultTeams } from '../data/teams.ts';
import { TRACKS } from '../data/tracks.ts';
import { runQualifying } from './qualifying.ts';
import { RaceSim } from './race.ts';
import type { RaceConfig } from './race.ts';
import { replayRace } from './replay.ts';
import { DIFFICULTY } from './tuning.ts';
import type { Difficulty } from './types.ts';

const teams = defaultTeams();
const PLAYER = 'cobalt';

function config(seed: number, difficulty?: Difficulty, track = TRACKS[0]): RaceConfig {
  return { track, teams, grid: runQualifying(track, teams, seed).grid, laps: 25, seed, playerTeamId: PLAYER, difficulty };
}

/** How far each rival's first planned stop sits from the stop the planner would choose with no noise. */
function stopGap(difficulty: Difficulty): number {
  const gaps: number[] = [];
  for (let seed = 1; seed <= 12; seed++) {
    const cfg = config(seed, difficulty);
    for (const car of new RaceSim(cfg).cars) {
      if (car.isPlayer) continue;
      const best = RaceSim.suggestPlan(cfg.track, car.team, car.driver, cfg.laps, null);
      if (car.plan.stops.length > 0 && best.stops.length > 0) gaps.push(Math.abs(car.plan.stops[0].lap - best.stops[0].lap));
    }
  }
  return gaps.reduce((s, g) => s + g, 0) / gaps.length;
}

describe('difficulty', () => {
  it('Medium is the race the game ran before difficulty existed', () => {
    // Today's values, so a later change to Medium fails here instead of breaking every stored replay.
    assert.deepEqual(DIFFICULTY.medium, { rivalPace: 0, planJitter: 1, stopSpread: 3, weatherCaution: [0.5, 1.3] });
    const before = replayRace(config(6), []);
    const medium = replayRace(config(6, 'medium'), []);
    assert.deepEqual(medium.results(), before.results());
    assert.deepEqual(
      medium.cars.map((c) => c.laps),
      before.cars.map((c) => c.laps),
    );
  });

  it("moves the rivals' pace and leaves the player's cars alone", () => {
    const easy = new RaceSim(config(3, 'easy'));
    const hard = new RaceSim(config(3, 'hard'));
    const gap = DIFFICULTY.easy.rivalPace - DIFFICULTY.hard.rivalPace;
    assert.ok(gap > 0);
    for (const car of easy.cars) {
      const other = hard.carById(car.id);
      assert.ok(other);
      if (car.isPlayer) assert.equal(other.carDelta, car.carDelta);
      else assert.ok(Math.abs(car.carDelta - other.carDelta - gap) < 1e-9, car.id);
    }
  });

  it('never has a rival plan a stop before lap 4', () => {
    for (const level of ['easy', 'medium', 'hard'] as const) {
      for (let seed = 1; seed <= 10; seed++) {
        for (const car of new RaceSim(config(seed, level)).cars) {
          for (const stop of car.plan.stops) assert.ok(stop.lap >= 4, `${level} seed ${seed} ${car.id} stops on lap ${stop.lap}`);
        }
      }
    }
  });

  it("puts rivals' planned stops nearer the best plan on Hard than on Medium", () => {
    const hard = stopGap('hard');
    const medium = stopGap('medium');
    assert.ok(hard < medium / 2, `hard ${hard.toFixed(2)}, medium ${medium.toFixed(2)}`);
  });

  it('makes rivals slower to change tyres for rain on Easy than on Hard, and leaves the player alone', () => {
    const easy = new RaceSim(config(4, 'easy'));
    const hard = new RaceSim(config(4, 'hard'));
    const rivals = (sim: RaceSim) => sim.cars.filter((c) => !c.isPlayer).map((c) => c.weatherCaution);
    assert.ok(Math.min(...rivals(easy)) >= Math.max(...rivals(hard)));
    for (const car of easy.cars.filter((c) => c.isPlayer)) assert.equal(hard.carById(car.id)?.weatherCaution, car.weatherCaution);
  });

  it('moves the rivals in qualifying too', () => {
    const track = TRACKS[0];
    const place = (difficulty: Difficulty) => {
      const grid = runQualifying(track, teams, 9, { playerTeamId: PLAYER, difficulty }).grid;
      return grid.indexOf(`${PLAYER}:0`) + grid.indexOf(`${PLAYER}:1`);
    };
    assert.ok(place('easy') < place('hard'), `easy ${place('easy')}, hard ${place('hard')}`);
    assert.deepEqual(runQualifying(track, teams, 9, { playerTeamId: PLAYER, difficulty: 'medium' }), runQualifying(track, teams, 9));
  });
});
